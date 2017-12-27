'use strict';

/* eslint-disable no-param-reassign */

module.exports.hello = function (context) {
  context.log('JavaScript HTTP trigger function processed a request.');

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: 'Go Serverless v1.x! Your function executed successfully!',
  };

  context.done();
};

module.exports.pullRequestComment = function (context, data) {
  context.log('GitHub WebHook triggered!', data.number)

   // context.log(context.req)
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

  if(githubEvent !== 'pull_request') {
    const errorMsg = 'Event was not pull_request - ignoring'
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
//  context.log(data);


  // Do custom stuff here with github event data
  // For more on events see https://developer.github.com/v3/activity/events/types/
  const commentsURL =  data.pull_request.comments_url
  if(!commentsURL) {
    const errorMsg = 'No comments_url found on request'
    console.log(errorMsg)
    context.res = { status: 401, body: errorMsg }
    context.done()
    return
  }

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: 'Go Serverless v1.x! Your function executed successfully!',
  };

  context.res = { headers: { "Content-Type": "application/json", "Accept": "application/vnd.github.v3.raw+json" }, body: 'New GitHub comment: yadda yadda' };
  context.done()
};
