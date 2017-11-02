const promoteArchiveAction = require('./promote_archive_action')
const downloadArchiveAction = require('./download_archive_action')

const installArchiveAction = (reference) => {
  return downloadArchiveAction(reference)
    .then((resourceRequest) => {
      return promoteArchiveAction(resourceRequest)
    })
}

module.exports = installArchiveAction
