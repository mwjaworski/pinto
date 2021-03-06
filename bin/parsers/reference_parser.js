const StatusLog = require('../support/status_log')
const crypto = require('crypto')
const path = require('path')
const _ = require('lodash')

const ApplicationConfiguration = require('../configurations/application')

const Discover = {
  COMPONENT_ASPECT: /.*?\/([a-z0-9-_.]*?)[./]?(zip|tar|tgz|gz|tar.gz|git)?$/i,
  HAS_EMBEDDED_VERSION: /(.*?)[_]+([\d.]*)$/i
}

/**
 * a _reference_ can have a shape of scope, resource, or archiveRequest
 *
 * scope-reference to resource-reference
 * "@source/group/resource version" ==> "url resource version"
 *
 * resource-reference to archiveRequest-reference
 * "uri#version" ===> { url, version }
 */
class ReferenceParser {
  /**
   * duplicate of `referenceToArchiveRequest`
   * @param {*} reference
   * @param {*} overrideUniqueName
   */
  static referenceToArchivePackage (manifestConfiguration) {
    const reference = manifestConfiguration.releaseReference
    const scopeOrReference = this.normalizeReference(reference)
    const {
      resource,
      scope
    } = this.__scopeToResource(scopeOrReference, `push.uri`)

    return this.__resourceToArchivePackage(manifestConfiguration, resource, scope)
  }

  static referenceToArchiveRequest (reference, overrideUniqueName = undefined) {
    const scopeOrReference = this.normalizeReference(reference)
    const {
      resource,
      scope
    } = this.__scopeToResource(scopeOrReference, `pull.uri`)

    // TODO replace {} with manifestConfiguration so we can add more variables to the pull uri
    return this.__resourceToArchiveRequest(resource, scope, overrideUniqueName)
  }

  /**
   *
   * folder#1.2.3 res  => folder#1.2.3 res
   * folder#1.2.3      => folder#1.2.3
   * folder res        => folder#master res
   *
   * @param { reference } reference
   * @returns "reference"
   */
  static normalizeReference (reference) {
    return _.trim(reference || '', path.sep)
  }

  static splitArchiveExtension (uri) {
    const [_0, archive, extension] = Discover.COMPONENT_ASPECT.exec(uri) || [``, uri, ``] // eslint-disable-line
    return [archive, extension]
  }

  static splitURIVersion (reference) {
    const patternMarkers = ApplicationConfiguration.get(`rules.patternMarkers`)
    const versionMarker = _.find(patternMarkers.version, (versionMarker) => reference.indexOf(versionMarker) !== -1)

    return reference.split(versionMarker || _.first(patternMarkers.version))
  }

  /**
   *
   * @param {*} scopeOrReference
   * @param {String} operationType either `push_uri` or `pull_uri`
   */
  static __scopeToResource (scopeOrReference, operationType) {
    const patternMarkers = ApplicationConfiguration.get(`rules.patternMarkers`)
    const [uri, version = `*`] = this.splitURIVersion(scopeOrReference)
    const uriAspects = uri.split(patternMarkers.separator)
    const scope = this.__matchConversionRule(uriAspects)

    if (!scope) {
      return {
        resource: scopeOrReference,
        scope: {}
      }
    }

    const {
      pattern,
      constants
    } = scope

    const templateVariables = _.zipObject(pattern.split(patternMarkers.separator), uriAspects)
    const template = _.get(scope, operationType)

    if (!template) {
      return {
        resource: scopeOrReference,
        scope: {}
      }
    }

    return {
      scope,
      resource: _.template(template)(_.merge({}, templateVariables, constants, {
        version
      }))
    }
  }

  /**
   *
   * @param {*} resource
   */
  static __resourceToArchivePackage (manifestConfiguration, resource, scope) {
    const versionMarker = _.first(ApplicationConfiguration.get(`rules.patternMarkers.version`))
    const {
      release
    } = ApplicationConfiguration.get(`paths`)

    const version = manifestConfiguration.version
    const archive = manifestConfiguration.name

    const sources = ApplicationConfiguration.get('sources')
    const sourceScope = sources[scope.reference] || {}

    manifestConfiguration.initializeLocalRelease({
      releaseFolder: manifestConfiguration.releaseFolder || _.get(sourceScope, 'push.subfolder', `./`)
    })

    const releaseStaging = `${release}/${archive}__${version}`
    const releaseFolder = manifestConfiguration.releaseFolder
    const uuid = `${archive}${versionMarker}${version}`
    const uri = resource

    StatusLog.inform('package', uri)
    return {
      releaseAsset: null,
      releaseStaging,
      releaseFolder,
      sourceScope,
      archive,
      version,
      scope,
      uuid,
      uri
    }
  }

  /**
   *
   * @param {*} resource
   */
  static __resourceToArchiveRequest (resource, scope, overrideUniqueName = undefined) {
    const versionMarker = _.first(ApplicationConfiguration.get(`rules.patternMarkers.version`))
    const {
      staging,
      cache
    } = ApplicationConfiguration.get(`paths`)

    const [uri, _version] = this.splitURIVersion(resource)
    const [_archive, extension] = this.splitArchiveExtension(uri)
    const [archive, version = `*`] = this.__detectVersionInArchive(_archive, _version)

    const versionFolder = crypto.createHash(`md5`).update(version).digest(`hex`)
    const installedName = (overrideUniqueName && overrideUniqueName.length > 0) ? overrideUniqueName : archive

    const safeExtension = (extension) ? `.${extension}` : `/`
    const cachePath = `${cache}/${archive}__${versionFolder}${safeExtension}`
    const stagingPath = `${staging}/${archive}/${versionFolder}/`
    const uuid = `${installedName}${versionMarker}${version}`

    StatusLog.inform('request', uri)
    return {
      installedVersion: version,
      installedName,
      stagingPath,
      cachePath,
      archive,
      version,
      scope,
      uuid,
      uri
    }
  }

  static __detectVersionInArchive (archive, version) {
    const embeddedVersion = Discover.HAS_EMBEDDED_VERSION.exec(archive)
    const archiveVersion = _.tail(embeddedVersion)

    return (embeddedVersion)
      ? [_.first(archiveVersion), _.last(archiveVersion)]
      : [archive, version]
  }

  /**
   *
   * @param {*} uriAspects
   * @returns a scope object or undefined
   */
  static __matchConversionRule (uriAspects) {
    const sources = ApplicationConfiguration.get(`sources`)
    const scope = uriAspects[0] = _.first(uriAspects) || ''

    const scopeObj = _.find(sources, (_0, sourceKey) => {
      return scope === sourceKey
    })

    if (scopeObj) {
      scopeObj.reference = scope
    }

    return scopeObj
  }
}

module.exports = ReferenceParser
