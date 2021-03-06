const axios = require('axios')
const vl = require('vega-lite')
const vega = require('vega')
const imgur = require('imgur')

// GitHub Organization to CDash project.
const cdashProjects = {
  InsightSoftwareConsortium: 'Insight',
  KitwareMedical: 'Insight',
  SimpleITK: 'SimpleITK',
  SuperElastix: 'SuperElastix'
}

// GitHub Organization to CDash instance
const cdashInstances = {
  InsightSoftwareConsortium: 'https://open.cdash.org',
  KitwareMedical: 'https://open.cdash.org',
  SimpleITK: 'https://open.cdash.org',
  SuperElastix: 'http://trunk.cdash.org'
}
// GitHub Status Context that generate CDash builds
const contextWithCTestBuildsPrefix = [
  'ci/circleci', // ITKSoftwareGuide, ITK, SimpleITK builds
  'continuous-integration/jenkins/pr-merge', // SuperElastix
  'continuous-integration/jenkins/branch', // SuperElastix
  'continuous-integration/travis-ci/pr', // SuperElastix
  'continuous-integration/appveyor/pr', // ITKTubeTK
  'ITK.Linux', // ITK Azure Pipelines
  'ITK.macOS', // ITK Azure Pipelines
  'ITK.Windows', // ITK Azure Pipelines
  'ITK.Linux.Python', // ITK Azure Pipelines
  'ITK.macOS.Python', // ITK Azure Pipelines
  'ITK.Windows.Python', // ITK Azure Pipelines
  'InsightSoftwareConsortium.', // ITKExamples, ITK modules Azure Pipelines
  'SimpleITK.', // SimpleITK Azure Pipelines
  'KitwareMedical.', // ITKTubeTK
  'Build, test, package / build-test-cxx' // GitHub Actions for remote modules
]

function contextHasCTestBuild (context) {
  return contextWithCTestBuildsPrefix.filter((withCTest) => context.startsWith(withCTest)).length > 0
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = app => {
  app.on(['status'], check)
  app.on(['check_suite.rerequested'], check)
  app.on(['check_run.rerequested'], check)

  async function check (context) {
    context.log(`Received payload id: ${context.payload.id}`)
    // context.log(context.payload)
    let sha = null
    if (context.event === 'status') {
      sha = context.payload.sha
    } else if (context.event === 'check_run.rerequested') {
      sha = context.payload.check_run.head_sha
    } else {
      // check_suite.rerequested
      sha = context.payload.check_suite.head_sha
    }
    const organization = context.payload.organization.login
    const headShaShort = sha.substr(0, 7)

    const cdashProject = cdashProjects[organization]
    const cdashInstance = cdashInstances[organization]
    const cdashUrl = `${cdashInstance}/index.php?project=${cdashProject}&filtercount=1&showfilters=0&field1=revision&compare1=63&value1=${headShaShort}&showfeed=0`
    let postCDashLinkStatus = false
    if (context.event === 'status') {
      if (contextHasCTestBuild(context.payload.context)) {
        const description = context.payload.description.toLowerCase()
        if (!description.includes('cdash')) {
          postCDashLinkStatus = true
        }
      }
    } else {
      postCDashLinkStatus = true
    }

    if (postCDashLinkStatus) {
      let hasFailedBuild = false
      let hasBuild = false
      const statusesForRef = await context.github.repos.listStatusesForRef(context.repo({ ref: sha }))
      const pendingBuilds = {}
      let successAndFailureCount = 0
      statusesForRef.data.forEach((status) => {
        if (contextHasCTestBuild(status.context)) {
          if (status.state === 'pending') {
            pendingBuilds[status.context] = true
          }
          if (status.state !== 'pending') {
            hasBuild = true
          }
          if (status.state === 'error' || status.state === 'failure') {
            hasFailedBuild = true
            successAndFailureCount++
          }
          if (status.state === 'success') {
            successAndFailureCount++
          }
        }
      })
      statusesForRef.data.forEach((status) => {
        if (contextHasCTestBuild(status.context)) {
          if (status.state !== 'pending') {
            pendingBuilds[status.context] = false
          }
        }
      })
      let buildsArePending = false
      for (const build in pendingBuilds) {
        if (pendingBuilds[build]) {
          buildsArePending = true
          break
        }
      }

      if (!hasBuild) {
        context.log('No builds have completed yet.')
        return
      }

      let buildsResponse = {}
      for (let attempt in [1, 2, 3, 4]) {  // eslint-disable-line
        buildsResponse = await axios.get(`${cdashInstance}/api/v1/index.php?project=${cdashProject}&filtercount=1&showfilters=0&field1=revision&compare1=63&value1=${headShaShort}`)
        // Wait for CDash to process the initial build
        if (buildsResponse.data.buildgroups.length > 0) {
          break
        }
        await sleep(2000)
      }
      const data = buildsResponse.data
      const metricExtrema = {
        configureErrors: 0,
        configureWarnings: 0,
        buildErrors: 0,
        buildWarnings: 0,
        testsFailed: 0,
        testsPassed: 0
      }
      const metricSums = {
        configure: 0,
        buildErrors: 0,
        buildWarnings: 0,
        testsFailed: 0
      }
      data.buildgroups[0].builds.forEach((build) => {
        metricSums.configure += build.configure.error
        metricSums.configure += build.configure.warning
        metricSums.buildErrors += build.compilation.error
        metricSums.buildWarnings += build.compilation.warning
        metricSums.testsFailed += build.test.fail
        if (build.configure.error > metricExtrema.configureErrors) {
          metricExtrema.configureErrors = build.configure.error
        }
        if (build.configure.warning > metricExtrema.configureWarningcs) {
          metricExtrema.configureWarningcs = build.configure.warning
        }
        if (build.compilation.error > metricExtrema.buildErrors) {
          metricExtrema.buildErrors = build.compilation.error
        }
        if (build.compilation.warning > metricExtrema.buildWarningcs) {
          metricExtrema.buildWarningcs = build.compilation.warning
        }
        if (build.test.fail > metricExtrema.testsFailed) {
          metricExtrema.testsFailed = build.test.fail
        }
        if (build.test.pass > metricExtrema.testsPassed) {
          metricExtrema.testsPassed = build.test.pass
        }
      })
      const vegaDataValues = []
      data.buildgroups[0].builds.forEach((build) => {
        const site = `${build.site} - ${build.buildplatform}`
        vegaDataValues.push({
          site: site,
          metricName: 'Configure Errors',
          metricValue: build.configure.error,
          metricIndicator: build.configure.error ? -1.0 * build.configure.error / metricExtrema.configureErrors : 0.0
        })
        vegaDataValues.push({
          site: site,
          metricName: 'Configure Warnings',
          metricValue: build.configure.warning,
          metricIndicator: build.configure.warning ? -1.0 * build.configure.warning / metricExtrema.configureWarnings : 0.0
        })
        vegaDataValues.push({
          site: site,
          metricName: 'Build Errors',
          metricValue: build.compilation.error,
          metricIndicator: build.compilation.error ? -1.0 * build.compilation.error / metricExtrema.buildErrors : 0.0
        })
        vegaDataValues.push({
          site: site,
          metricName: 'Build Warnings',
          metricValue: build.compilation.warning,
          metricIndicator: build.compilation.warning ? -1.0 * build.compilation.warning / metricExtrema.buildWarnings : 0.0
        })
        vegaDataValues.push({
          site: site,
          metricName: 'Tests Failed',
          metricValue: build.test.fail,
          metricIndicator: build.test.fail ? -1.0 * build.test.fail / metricExtrema.testsFailed : 0.0
        })
        vegaDataValues.push({
          site: site,
          metricName: 'Tests Passed',
          metricValue: build.test.pass,
          metricIndicator: build.test.pass ? 1.0 * build.test.pass / metricExtrema.testsPassed : 0.0
        })
        vegaDataValues.push({
          site: site,
          metricName: 'Time',
          metricValue: build.time,
          metricIndicator: 0.0
        })
      })
      // const revision = data.filterdata.filters[0].value
      const vegaLiteSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
        width: 800,
        data: {
          values: vegaDataValues,
          name: 'source'
        },
        encoding: {
          y: { field: 'site', type: 'ordinal', axis: { title: 'Site' } },
          x: {
            field: 'metricName',
            type: 'nominal',
            sort: ['Configure Warnings', 'Configure Errors', 'Build Warnings', 'Build Errors', 'Tests Failed', 'Tests Passed', 'Time'],
            axis: { title: null, labelAngle: 0, orient: 'bottom' }
          }
        },
        layer: [{
          mark: 'rect',
          encoding: {
            color: {
              field: 'metricIndicator',
              type: 'quantitative',
              legend: null,
              scale: { domain: [-1.0, 1.0], scheme: 'pinkyellowgreen' }
            }
          }
        }, {
          mark: 'text',
          encoding: {
            text: { field: 'metricValue', type: 'ordinal' },
            color: {
              condition: { test: 'datum.metricIndicator > -0.3 && datum.metricIndicator < 0.3', value: 'black' },
              value: 'white'
            }
          }
        }],
        config: {
          scale: { bandPaddingInner: 0, bandPaddingOuter: 0 },
          text: { baseline: 'middle' }
        }
      }
      const { spec } = vl.compile(vegaLiteSpec)
      // create a new view instance for a given Vega JSON spec
      const view = new vega.View(vega.parse(spec))
        .renderer('none')
        .initialize()
      // generate a static PNG image
      const canvas = await view.toCanvas()
      // process node-canvas instance
      const dataUrl = canvas.toDataURL()
      const regex = /^data:.+\/(.+);base64,(.*)$/
      const base64 = dataUrl.match(regex)[2]
      const uploadResponse = await imgur.uploadBase64(base64)
      const imageUrl = uploadResponse.data.link
      let summary = 'Totals: '
      if (metricSums.configure) {
        summary += `**${metricSums.configure} configuration issues**, `
      } else {
        summary += `${metricSums.configure} configuration issues, `
      }
      if (metricSums.buildErrors) {
        summary += `**${metricSums.buildErrors} build errors**, `
      } else {
        summary += `${metricSums.buildErrors} build errors, `
      }
      if (metricSums.buildWarnings) {
        summary += `**${metricSums.buildWarnings} build warnings**, `
      } else {
        summary += `${metricSums.buildWarnings} build warnings, `
      }
      if (metricSums.testsFailed) {
        summary += `**${metricSums.testsFailed} test failures**.`
      } else {
        summary += `${metricSums.testsFailed} test failures.`
      }

      const checkParameters = {
        name: 'CDash',
        head_sha: sha,
        details_url: cdashUrl,
        output: {
          title: 'Build analysis summary',
          summary,
          text: `[![CDash build analysis summary](${imageUrl})](${cdashUrl}).`
          // images: [{ alt: "CDash build analysis summary", image_url: imageUrl, caption: "Build summary" }]
        }
      }
      let checkStatus = 'completed'
      if (buildsArePending) {
        checkStatus = 'in_progress'
      } else {
        checkParameters.completed_at = new Date()
        if (hasFailedBuild) {
          checkParameters.conclusion = 'failure'
        } else {
          checkParameters.conclusion = 'success'
        }
      }
      checkParameters.status = checkStatus

      const existingChecks = await context.github.checks.listForRef(context.repo({
        check_name: 'CDash',
        ref: sha
      }))
      const createNewCheck = existingChecks.data.total_count < 1
      if (createNewCheck) {
        // Only create the check when a check does not exist and this is the
        // initial success or failure
        if (successAndFailureCount >= 1) {
          return context.github.checks.create(context.repo(checkParameters))
        } else {
          context.log('Skipping check creation')
        }
      } else {
        checkParameters.check_run_id = existingChecks.data.check_runs[0].id
        return context.github.checks.update(context.repo(checkParameters))
      }
    } else {
      context.log('No CDash status post required.')
    }
  }
}
