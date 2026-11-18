import {
  discoverJianying,
  getStatus,
  inspectDraft,
  listDrafts,
} from '../src/core.js'

const config = {
  installDirs: ['E:/JianyingPro', 'F:/JianyingPro'],
  tempRoot: 'F:/Codex/.dsh-jianying-plugin/smoke',
}

const installation = await discoverJianying(config)
const status = await getStatus(config)
const listed = await listDrafts(config, { limit: 3 })
const firstDraft = listed.drafts[0]
const inspection = firstDraft
  ? await inspectDraft(config, { id: firstDraft.id })
  : null

console.log(
  JSON.stringify(
    {
      installation,
      status,
      drafts: listed,
      firstDraftInspection: inspection,
    },
    null,
    2,
  ),
)
