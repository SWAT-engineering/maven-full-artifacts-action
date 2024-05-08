import * as core from '@actions/core'
import {exec} from '@actions/exec'
import * as io from '@actions/io'
import {DefaultArtifactClient} from '@actions/artifact'
import * as github from '@actions/github'
import {promises} from 'fs'
import path from 'path'
import os from 'os'

async function run(): Promise<void> {
  try {
    const localDir = path.join(process.env['RUNNER_TEMP'] || os.tmpdir(), github.context.sha)
    await io.mkdirP(localDir)
    const localMavenRepo = `local::file://${localDir}`
    await exec('mvn', ['-version'])
    core.info('Running maven deploy')
    const mavenResult = await exec(
      'mvn',
      [
        '-B',
        ...core.getMultilineInput('maven-options'),
        '-Dmaven.test.skip=true',
        '-DskipTests',
        `-DaltDeploymentRepository=${localMavenRepo}`,
        'package',
        'org.apache.maven.plugins:maven-deploy-plugin:3.1.2:deploy'
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
    await new DefaultArtifactClient().uploadArtifact(artifactName, await allFiles(localDir), localDir, {
      compressionLevel: 0
    })

    core.info('Finished uploading artifact')
    core.setOutput('artifact-root-dir', localDir)
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

async function allFiles(dir: string): Promise<string[]> {
  return (await promises.readdir(dir, {recursive: true, withFileTypes: true}))
    .filter(e => e.isFile())
    .map(e => `${e.path}/${e.name}`)
}

run()
