[CmdletBinding()]
param(
  [ValidateSet('health', 'request')]
  [string]$Action = 'health',
  [ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')]
  [string]$Method = 'GET',
  [string]$Path = '/.custom-agent/health',
  [string]$Body = '{}',
  [string]$BodyBase64 = '',
  [string]$InstanceId = '',
  [string]$SessionId = '',
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

function Get-ProcessEnvironmentBlock {
  param([int]$ProcessId)

  if (-not ('JianyingHostProcessEnvironment' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class JianyingHostProcessEnvironment
{
    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_BASIC_INFORMATION
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(
        IntPtr process,
        IntPtr address,
        byte[] buffer,
        IntPtr size,
        out IntPtr bytesRead);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr process,
        int informationClass,
        ref PROCESS_BASIC_INFORMATION information,
        int informationLength,
        out int returnLength);

    public static Dictionary<string, string> Read(int processId)
    {
        IntPtr process = OpenProcess(0x0410, false, processId);
        if (process == IntPtr.Zero)
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

        try
        {
            PROCESS_BASIC_INFORMATION information = new PROCESS_BASIC_INFORMATION();
            int returnLength;
            int status = NtQueryInformationProcess(
                process,
                0,
                ref information,
                Marshal.SizeOf(information),
                out returnLength);
            if (status != 0)
                throw new Exception("NtQueryInformationProcess failed: " + status);

            byte[] pointer = new byte[8];
            IntPtr bytesRead;
            if (!ReadProcessMemory(
                process,
                IntPtr.Add(information.PebBaseAddress, 0x20),
                pointer,
                (IntPtr)pointer.Length,
                out bytesRead))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

            IntPtr processParameters = new IntPtr(BitConverter.ToInt64(pointer, 0));
            if (!ReadProcessMemory(
                process,
                IntPtr.Add(processParameters, 0x80),
                pointer,
                (IntPtr)pointer.Length,
                out bytesRead))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

            IntPtr environment = new IntPtr(BitConverter.ToInt64(pointer, 0));
            byte[] data = new byte[65536];
            if (!ReadProcessMemory(
                process,
                environment,
                data,
                (IntPtr)data.Length,
                out bytesRead))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

            Dictionary<string, string> result =
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            string block = Encoding.Unicode.GetString(data, 0, (int)bytesRead);
            foreach (string entry in block.Split('\0'))
            {
                int separator = entry.IndexOf('=');
                if (separator <= 0 || separator + 1 >= entry.Length)
                    continue;
                result[entry.Substring(0, separator)] = entry.Substring(separator + 1);
            }
            return result;
        }
        finally
        {
            CloseHandle(process);
        }
    }
}
'@ -Language CSharp
  }

  return [JianyingHostProcessEnvironment]::Read($ProcessId)
}

function Find-AgentHost {
  $process = Get-CimInstance Win32_Process -Filter "Name='vebun.exe'" |
    Where-Object {
      $_.CommandLine -match 'app-server\.mjs' -and
      $_.CommandLine -match '--port(?:\s+|=)(\d+)'
    } |
    Sort-Object CreationDate -Descending |
    Select-Object -First 1

  if (-not $process) {
    throw 'Jianying custom-agent server is not running.'
  }

  $match = [regex]::Match($process.CommandLine, '--port(?:\s+|=)(\d+)')
  if (-not $match.Success) {
    throw 'Unable to resolve the Jianying custom-agent server port.'
  }

  return @{
    ProcessId = [int]$process.ProcessId
    Port = [int]$match.Groups[1].Value
  }
}

try {
  $hostProcess = Find-AgentHost
  $environment = Get-ProcessEnvironmentBlock -ProcessId $hostProcess.ProcessId
  $token = $environment['CUSTOM_AGENT_SERVER_TOKEN']
  if (-not $token -or -not $token.Trim()) {
    throw 'Jianying custom-agent server token is unavailable.'
  }

  if ($Action -eq 'health') {
    $Path = '/.custom-agent/health'
    $Method = 'GET'
  }

  $uri = "http://127.0.0.1:$($hostProcess.Port)$Path"
  $headers = @{
    'x-custom-agent-token' = $token
    'x-request-id' = "dsh-jianying-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  }
  if ($InstanceId) {
    $headers['x-agent-runtime-instance-id'] = $InstanceId
  }
  if ($SessionId) {
    $headers['x-agent-runtime-session-id'] = $SessionId
  }

  $request = @{
    Uri = $uri
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = $TimeoutSec
  }
  if ($Method -ne 'GET') {
    $request.Body = if ($BodyBase64) {
      [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($BodyBase64))
    } else {
      $Body
    }
    $request.ContentType = 'application/json; charset=utf-8'
  }

  $response = Invoke-WebRequest @request
  $content = if ($response.Content -is [byte[]]) {
    [Text.Encoding]::UTF8.GetString($response.Content)
  } else {
    [string]$response.Content
  }

  [PSCustomObject]@{
    ok = $true
    status = [int]$response.StatusCode
    port = $hostProcess.Port
    content = $content
  } | ConvertTo-Json -Depth 20 -Compress
} catch {
  $message = $_.Exception.Message
  if ($_.ErrorDetails.Message) {
    $message = $_.ErrorDetails.Message
  }
  [PSCustomObject]@{
    ok = $false
    status = 0
    error = $message
  } | ConvertTo-Json -Depth 8 -Compress
  exit 1
}
