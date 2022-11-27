import * as core from '@actions/core'
import {exec} from '@actions/exec'
import * as io from '@actions/io'
import * as github from '@actions/github'
import * as artifact from '@actions/artifact'
import {lstatSync, readdirSync} from 'fs'
import path from 'path'
import os from 'os'

async function run(): Promise<void> {
  try {
    const localDir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), github.context.sha)
    await io.mkdirP(localDir)
    const localMavenRepo = `local::file://${localDir}`
    await exec('mvn', ['-version'])
    core.info('Running maven deploy')
    const mavenResult = await exec(
      'mvn',
      [
        '-B',
        '-X',
        ...(core.getInput('maven-options').split(' ').trim()),
        '-Dmaven.test.skip=true',
        '-DskipTests',
        `-DaltDeploymentRepository=${localMavenRepo}`,
        'package',
        'org.apache.maven.plugins:maven-deploy-plugin:3.0.0-M1:deploy'
      ].filter(s => s && s !== '')
    )

    if (mavenResult !== 0) {
      core.setFailed(`Maven failed with error: ${mavenResult}`)
      return
    }

    const refs = github.context.ref.split('/')
    let artifactName = `${github.context.repo.repo}-${refs[2]}`
    if (refs[1] !== 'tags') {
      artifactName += `-${github.context.sha}`
    }

    core.info('Uploading results as artifact')
    const uploadResult = await artifact.create().uploadArtifact(artifactName, readFiles(localDir), localDir, {
      continueOnError: false
    })

    if (uploadResult.failedItems.length > 0) {
      throw new Error(`Error uploading artifact, failed files: ${uploadResult.failedItems}`)
    }
    core.info('Finished uploading artifact')
    core.setOutput('artifact-root-dir', localDir)
  } catch (error: any) {
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
