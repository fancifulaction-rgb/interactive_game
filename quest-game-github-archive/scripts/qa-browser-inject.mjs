import { readFileSync, writeFileSync } from 'fs'

const j = JSON.parse(readFileSync('.gstack/qa-fixture.json', 'utf8'))
const sessionStr = JSON.stringify(j.session)
const lines = [
  `localStorage.setItem(${JSON.stringify(j.storageKey)}, ${JSON.stringify(sessionStr)});`,
  `localStorage.setItem('admin_logged_in', 'true');`,
  `localStorage.setItem('admin_email', 'admin@quest.game');`,
  `localStorage.setItem('admin_username', 'admin@quest.game');`,
  `localStorage.setItem('admin_user_id', ${JSON.stringify(j.session.user.id)});`,
  `location.href = ${JSON.stringify(`${j.origin}/admin/panel`)};`,
]
writeFileSync('.gstack/qa-inject.js', lines.join('\n'))
console.log(j.gameCode)
