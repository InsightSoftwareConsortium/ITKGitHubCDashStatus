'use strict';

const axios = require('axios')
const process = require('process')

/* eslint-disable no-param-reassign */

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
  //context.log(data);


  const statusPostURL =  data.repository.url + '/statuses/' + data.sha
  if(!statusPostURL) {
    const errorMsg = 'Expected status information not found on request'
    console.log(errorMsg)
    context.res = { status: 401, body: errorMsg }
    context.done()
    return
  }

  // TODO: Remove meeee!
  const owner = data.organization.login
  const token = process.env.GITHUB_ACCESS_TOKEN

  const headSha = data.sha
  const headShaShort = headSha.substr(0, 7)
  const cdashProject = 'Insight'
  const cdashUrl = `https://open.cdash.org/index.php?project=${cdashProject}&filtercount=1&showfilters=0&field1=revision&compare1=63&value1=${headShaShort}&showfeed=0`
  let postCDashLinkStatus = false
  const description = data.description.toLowerCase()
  if(description.includes('build') || description.includes('test')) {
    if(!data.description.toLowerCase().includes('cdash')) {
      postCDashLinkStatus = true
    }
  }

  const statusDescription = `View build and best results on CDash`
  if(postCDashLinkStatus) {
    const statusPayload = {
      "state": data.state,
      "target_url": cdashUrl,
      "description": statusDescription,
      "context": "continuous-integration/cdash"
    }

    return axios.post(statusPostURL,
      statusPayload,
      { auth: {
          username: owner,
          password: token
          }
      })
      .then(function (response) {
        context.res = { body: 'CDash status post initiated!' }
        context.log('CDash status post succeeded!')
      })
      .catch(function (error) {
        context.log('CDash status post failed!')
        context.log(error)
      })
  }


  context.res = {
    // status: 200, /* Defaults to 200 */
    body: 'No CDash status post required.'
  }
  context.done()
}
