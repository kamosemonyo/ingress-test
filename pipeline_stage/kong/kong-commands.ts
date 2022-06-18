import { CommonCommands } from "../../lib/commands"
import { ECR_REGION, EKS_DEPLOY_ROLE, ENV_PRE, ENV_PROD, INGRESS_TEMPLATES_BUCKET_NAME, KONG_DEV_TAG, KONG_PRE_TAG, KONG_PROD_TAG } from "../../lib/constants"
import { getKongTagVersion } from "../../lib/util"


export interface KongCommandProps {
    environment:string,
    repositoryName:string,
    account:string,
    propertiesFilePath:string,
    host?:string,
    replicas?:Number
}

export function kongVersionCommand (params:KongCommandProps) {
  return [
    `export VERSION=\`grep -oP \'version=\\K.*\' ${params.propertiesFilePath}\``,
    `echo "current new snapshot version $VERSION"`,
    'echo $VERSION > VERSION',
    `${KONG_DEV_TAG}=$(echo $VERSION)-snapshot`,
    `${KONG_PRE_TAG}=$(echo $VERSION)-pre`,
    `${KONG_PROD_TAG}=$(echo $VERSION)-prod`,
  ]
}

export function kongBuildImageCommand (params:KongCommandProps):string[] {
  const kongVersion = getKongTagVersion(params.environment)
  const kongEnvironment = getKongEnv(params.environment)

  return [
    `aws ecr get-login-password --region ${ECR_REGION} | docker login --username AWS --password-stdin ${params.account}.dkr.ecr.${ECR_REGION}.amazonaws.com`,
    `docker build -t ${params.account}.dkr.ecr.${ECR_REGION}.amazonaws.com/${params.repositoryName}:$${kongVersion} . --build-arg env=${kongEnvironment}`,
  ]
}

export function kongDeployImageCommand (params:KongCommandProps):string[] {
  const kongTagVersion = getKongTagVersion(params.environment)
  return [
   `docker push ${params.account}.dkr.ecr.${ECR_REGION}.amazonaws.com/${params.repositoryName}:$${kongTagVersion}`,
  ]
}

export function kongDeployToK8s (params:KongCommandProps) {
  if (params.host == undefined) {
    throw Error(`host not provided for ${params.repositoryName}`)
  }

  const kongTagVersion = getKongTagVersion(params.environment)
  const deployment = params.repositoryName + `-$(echo $${kongTagVersion})`
  const service = params.repositoryName
  const host = params.host.replace('$env', params.environment)

  return [
    `aws s3 sync s3://${INGRESS_TEMPLATES_BUCKET_NAME} .ingress/`,
    // Populate placeholder environment variables on templates
    `namespace=${params.environment}`,
    `service=${service}`,
    `deployment=${deployment}`,
    `hostname=${host}`,
    `docker_image=${params.account}.dkr.ecr.${ECR_REGION}.amazonaws.com/${service}:$${kongTagVersion}`,
    // Create Kong deployment manifest file
    'eval "echo \\"$(cat .ingress/deployment.yml)\\"" > .ingress/deployment.yml',
    'cat .ingress/deployment.yml',
    // Create Kong service manifest files
    'eval "echo \\"$(cat .ingress/service.yml)\\"" > .ingress/service.yml',
    'cat .ingress/service.yml',
    // Create Kong ingress manifest file
    'eval "echo \\"$(cat .ingress/ingress.yml)\\"" > .ingress/ingress.yml',
    'cat .ingress/ingress.yml',
    // Assume eks deploy role
    ...CommonCommands.assumeAwsRole(EKS_DEPLOY_ROLE),
    'aws eks update-kubeconfig --name non-prod --region af-south-1',
    'kubectl apply -f .ingress'
  ]
}

function getKongEnv (environment:string) {
  if (environment == ENV_PROD) {
    return 'prod'
  } else if (environment == ENV_PRE) {
    return 'preprod'
  } else {
    return 'dev'
  }
}