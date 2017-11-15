const createResourceRequestAction = require('./create_resource_request_action')
const applicationConfiguration = require('../configurations/application')
const DependencyLog = require('../support/dependency_log')
const FileSystem = require('../support/file_system')
const StatusLog = require('../support/status_log')

const downloadArchiveAction = (reference, installPath = undefined) => {
  // TODO cache with version name so we can pull multiple versions of one component to resolve requirements?
  return createResourceRequestAction(reference, installPath)
    .then((resourceRequest) => {
      const paths = applicationConfiguration.get(`paths`)
      const { isRedundant, archiveRequest, PackageTool, TransitTool } = resourceRequest

      if (isRedundant) {
        StatusLog.notify(`pre-cached ${archiveRequest.uri}`, archiveRequest.uuid)
        return new Promise((resolve) => {
          resolve(resourceRequest)
        })
      }

      FileSystem.createDirectory(`${paths.cache}/`)

      StatusLog.notify(`cache ${archiveRequest.uri}`, archiveRequest.uuid)
      return TransitTool
        .sendToCache(archiveRequest)
          .then(({ availableVersions }) => {
            DependencyLog.trackAvailableVersions(archiveRequest, availableVersions)
            FileSystem.removeDirectory(`${archiveRequest.stagingPath}`)
            FileSystem.createDirectory(`${archiveRequest.stagingPath}`)

            StatusLog.notify(`stage ${archiveRequest.uri}`, archiveRequest.uuid)
            return PackageTool
              .sendToStaging(archiveRequest)
          })
          .then(() => resourceRequest)
    })
}

module.exports = downloadArchiveAction
