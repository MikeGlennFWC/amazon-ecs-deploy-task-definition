const path = require('path');
const core = require('@actions/core');
const aws = require('aws-sdk');
const yaml = require('yaml');
const fs = require('fs');
const crypto = require('crypto');
 
const CODE_DEPLOY_WAIT_BUFFER_MINUTES = 10;
const CODE_DEPLOY_MAX_WAIT_MINUTES = 360;  // 6 hours
const CODE_DEPLOY_MIN_WAIT_MINUTES = 30;
const CODE_DEPLOY_WAIT_DEFAULT_DELAY_SEC = 15;

// Attributes that are returned by DescribeTaskDefinition, but are not valid RegisterTaskDefinition inputs
const IGNORED_TASK_DEFINITION_ATTRIBUTES = [
  'compatibilities',
  'taskDefinitionArn',
  'requiresAttributes',
  'revision',
  'status'
];

// Find value in a CodeDeploy AppSpec file with a case-insensitive key
function findAppSpecValue(obj, keyName) {
  return obj[findAppSpecKey(obj, keyName)];
}

function findAppSpecKey(obj, keyName) {
  if (!obj) {
    throw new Error(`AppSpec file must include property '${keyName}'`);
  }

  const keyToMatch = keyName.toLowerCase();

  for (var key in obj) {
    if (key.toLowerCase() == keyToMatch) {
      return key;
    }
  }

  throw new Error(`AppSpec file must include property '${keyName}'`);
}

function undefinedOrNullReplacer(_, value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value;
}

function cleanNullKeys(obj) {
  return JSON.parse(JSON.stringify(obj, undefinedOrNullReplacer));
}

function removeIgnoredAttributes(taskDef) {
  for (var attribute of IGNORED_TASK_DEFINITION_ATTRIBUTES) {
    if (taskDef[attribute]) {
      core.warning(`Ignoring property '${attribute}' in the task definition file. ` +
        'This property is returned by the Amazon ECS DescribeTaskDefinition API and may be shown in the ECS console, ' +
        'but it is not a valid field when registering a new task definition. ' +
        'This field can be safely removed from your task definition file.');
      delete taskDef[attribute];
    }
  }

  return taskDef;
}


async function run() {
  try {
    const ecs = new aws.ECS({
      customUserAgent: 'amazon-ecs-deploy-task-definition-for-github-actions'
    });
    const codedeploy = new aws.CodeDeploy({
      customUserAgent: 'amazon-ecs-deploy-task-definition-for-github-actions'
    });

    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });

    // Register the task definition
    core.debug('Registering the task definition');
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    const fileContents = fs.readFileSync(taskDefPath, 'utf8');
    const taskDefContents = removeIgnoredAttributes(cleanNullKeys(yaml.parse(fileContents)));
    const registerResponse = await ecs.registerTaskDefinition(taskDefContents).promise();
    const taskDefArn = registerResponse.taskDefinition.taskDefinitionArn;
    core.setOutput('task-definition-arn', taskDefArn);
  }
  catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
