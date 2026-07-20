const $ = (id) => document.getElementById(id)

chrome.storage.sync.get({ baseUrl: 'https://jls-navigator.m-peeters-4a0.workers.dev', token: '' }).then((s) => {
  $('baseUrl').value = s.baseUrl
  $('token').value = s.token
})

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    baseUrl: $('baseUrl').value.trim() || 'https://jls-navigator.m-peeters-4a0.workers.dev',
    token: $('token').value.trim(),
  })
  $('status').textContent = 'Saved ✓'
  setTimeout(() => ($('status').textContent = ''), 2500)
})
