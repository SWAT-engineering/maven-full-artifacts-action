import * as core from '@actions/core'
import {exec} from '@actions/exec'
import * as io from '@actions/io'
import * as github from '@actions/github'
import * as artifact from '@actions/artifact'
import {lstatSync, readdirSync} from 'fs'

async function run(): Promise<void> {
  try {
    const localDir = `/tmp/artifacts-maven-${github.context.sha}`
    await io.mkdirP(localDir)
    const localMavenRepo = `local::default::file://${localDir}`
    core.info('Running maven deploy')
    const mavenResult = await exec(
      'mvn',
      [
        '-B',
        core.getInput('maven-options'),
        '-DskipTests',
        `-DaltDeploymentRepository=${localMavenRepo}`,
        `-DaltReleaseDeploymentRepository=${localMavenRepo}`,
        'deploy'
      ].filter(s => s && s !== '')
    )

    if (mavenResult !== 0) {
      core.setFailed(`Maven failed with error: ${mavenResult}`)
      return
    }

    core.info('Uploading results as artifact')
    const uploadResult = await artifact
      .create()
      .uploadArtifact(`${github.context.repo.repo}-${github.context.sha}`, readFiles(localDir), localMavenRepo, {
        continueOnError: false
      })

    if (uploadResult.failedItems.length > 0) {
      throw new Error(`Error uploading artifact, failed files: ${uploadResult.failedItems}`)
    }
    core.info('Finished uploading artifact')
  } catch (error) {
    core.setFailed(error.message)
  }
}

function readFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullEntry = `${dir}/${entry}`
    if (lstatSync(fullEntry).isDirectory()) {
      result.push(...readFiles(fullEntry))
    } else {
      result.push(fullEntry)
    }
  }
  return result
}

run()
