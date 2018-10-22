# ITKGitHubCDashStatus

This provides a GitHub pull request status link to the CDash page for the
current patch's continuous integration builds.

Build and deploy
----------------

```
git clone https://github.com/InsightSoftwareConsortium/ITKGitHubCDashStatus.git
cd ITKGitHubCDashStatus
# Possibly required if gyp pkg-config related error: sudo apt install libsecret-1-dev
npm install
npm install -g serverless
# From https://github.com/organizations/InsightSoftwareConsortium/settings/apps/itkgithubcdashstatus
export GITHUB_APP_ID=1234
export GITHUB_PRIVATE_KEY=123456789abcd1536c09950c995ee7f2eae950e5
```

Debug
-----

A live view of the logs:

```
serverless logs -f pullRequestStatusWebhook -t
```

GitHub responses:

https://github.com/organizations/InsightSoftwareConsortium/settings/apps/itkgithubcdashstatus/advanced

Function deploy
---------------

To deploy the function only:

```
serverless deploy -f pullRequestStatusWebhook
```
