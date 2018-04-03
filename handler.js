'use strict';

const createGitHubApp = require('github-app')
const process = require('process')

// GitHub Organization to CDash project.
const cdashProjects = {
  'InsightSoftwareConsortium': 'Insight',
  'SimpleITK': 'SimpleITK',
  'SuperElastix': 'SuperElastix'
}

// GitHub Organization to CDash instance
const cdashInstances = {
  'InsightSoftwareConsortium': 'https://open.cdash.org',
  'SimpleITK': 'https://open.cdash.org',
  'SuperElastix': 'http://trunk.cdash.org'
}

// GitHub Organization to GitHub App Installation Id
const installationIds = {
  'InsightSoftwareConsortium': 79916,
  'SimpleITK': 81507,
  'SuperElastix': 87249
}


module.exports.pullRequestStatusWebhook = function (context, data) {

  const signature = context.req.headers['x-hub-signature']
  if(!signature) {
    const errorMsg = 'No x-hub-signature found on request'
    console.log(errorMsg)
    context.res = { status: 401, body: errorMsg }
    context.done()
    return
  }

  const githubEvent = context.req.headers['x-github-event']
  if(!githubEvent) {
    const errorMsg = 'No x-github-event found on request'
    console.log(errorMsg)
    context.res = { status: 422, body: errorMsg }
    context.done()
    return
  }

  if(githubEvent !== 'status') {
    const errorMsg = 'Event was not status - ignoring'
    console.log(errorMsg)
    context.res = { status: 204, body: '' }
    context.done()
    return
  }

  const id = context.req.headers['x-github-delivery']
  if(!id) {
    const errorMsg = 'No x-github-delivery found on request'
    console.log(errorMsg)
    context.res = { status: 401, body: errorMsg }
    context.done()
    return
  }


  const statusPostURL =  encodeURI(data.repository.url + '/statuses/' + data.sha)
  if(!statusPostURL) {
    const errorMsg = 'Expected status information not found on request'
    console.log(errorMsg)
    context.res = { status: 401, body: errorMsg }
    context.done()
    return
  }

  const organization = encodeURIComponent(data.organization.login)

  const headSha = encodeURIComponent(data.sha)
  const headShaShort = headSha.substr(0, 7)
  const cdashProject = cdashProjects[organization]
  const cdashInstance = cdashInstances[organization]
  const cdashUrl = `${cdashInstance}/index.php?project=${cdashProject}&filtercount=1&showfilters=0&field1=revision&compare1=63&value1=${headShaShort}&showfeed=0`
  let postCDashLinkStatus = false
  const contextWithCTestBuilds = [
    "ci/circleci: build-and-test", // ITK module builds
    "ci/circleci: build", // ITKSoftwareGuide builds
    "continuous-integration/jenkins/pr-merge", // SuperElastix
    "continuous-integration/jenkins/branch" // SuperElastix
  ]
  if (contextWithCTestBuilds.includes(data.context)) {
    const description = data.description.toLowerCase()
    if (!description.includes('cdash')) {
      if (!(data.state === 'pending')) {
        postCDashLinkStatus = true
      }
    }
  }

  const statusDescription = `View build and test results on CDash`
  if(postCDashLinkStatus) {
    const app = createGitHubApp({
        id: process.env.GITHUB_APP_ID,
        cert: process.env.GITHUB_PRIVATE_KEY
    })

    return app.asInstallation(installationIds[organization]).then(function (github) {
    // The following can be used to get the installations.
    //return app.asApp().then(function (github) {
      //github.integrations.getInstallations({}).then(context.log);
      // or this is available as data.installation.id
      github.repos.createStatus({
        owner: organization,
        repo: encodeURIComponent(data.repository.name),
        sha: headSha,
        "state": 'success',
        "target_url": cdashUrl,
        "description": statusDescription,
        "context": "continuous-integration/cdash"
      }).then(function (response) {
        context.res = { body: 'CDash status post succeeded!' }
        context.log('CDash status post succeeded!')
      }).catch(function (error) {
        context.log('CDash status post failed!')
        context.log(error)
      })
    })
  }


  context.res = {
    // status: 200, /* Defaults to 200 */
    body: 'No CDash status post required.'
  }
  context.done()
}
