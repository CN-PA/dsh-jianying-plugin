const button = document.querySelector('#copy-install')
const command = document.querySelector('#install-command')

button?.addEventListener('click', async () => {
  const text = command?.textContent?.trim()
  if (!text) return
  await navigator.clipboard.writeText(text)
  button.textContent = '已复制'
  setTimeout(() => {
    button.textContent = '复制'
  }, 1600)
})
