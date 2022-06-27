import { Shell } from "../../lib/shell"
import { ECR_REGION, EKS_DEPLOY_ROLE, ENV_PRE, ENV_PROD, INGRESS_TEMPLATES_BUCKET_NAME, KONG_DEV_TAG, KONG_PRE_TAG, KONG_PROD_TAG } from "../../lib/constants"
import { Kubectl } from "../../lib/kubctl"
import { getKongTagVersion } from "../../lib/util"


export interface KongCommandProps {
    environment:string,
    repositoryName:string,
    account:string,
    propertiesFilePath:string,
    host?:string,
    replicas?:Number
    githubOrgName:string
}

export function kongVersionCommand (params:KongCommandProps, isVersionUpdating?:boolean) {
  isVersionUpdating = (isVersionUpdating == undefined) ? false : isVersionUpdating
  
  return [
    `export VERSION=\`grep -oP \'version=\\K.*\' ${params.propertiesFilePath}\``,
    `echo "current new snapshot version $VERSION"`,
    ...(isVersionUpdating) ? updateKongVersion(params): [],
    'echo $VERSION > VERSION',
    `${KONG_DEV_TAG}=$(echo $VERSION)-snapshot`,
    `${KONG_PRE_TAG}=$(echo $VERSION)-pre`,
    `${KONG_PROD_TAG}=$(echo $VERSION)-prod`,
  ]
}

function updateKongVersion (params:KongCommandProps):string[] {
  return [
    'OLD_VERSION=$VERSION',
    'VERSION=$(($VERSION + 1))',
    // update version number
    `eval "sed -i 's/version=$OLD_VERSION/version=$VERSION/' version.properties"`,
    'git commit -am "Version updated to v$VERSION"',
    `git push https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git --all`
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
  const service = params.repositoryName
  const host = params.host.replace('$env', params.environment)
  
  const folder = '.ingress'

  return [
    Shell.s3DownloadFolder(INGRESS_TEMPLATES_BUCKET_NAME, folder),
    // Populate placeholder environment variables on templates
    ...Shell.setDeploymentEnvs({
      account: params.account,
      region: ECR_REGION,
      namespace: params.environment,
      service: service,
      version: kongTagVersion,
      hostname: host
    }),
    // Create Kong deployment manifest file
    Shell.replaceEnvPlaceHolderValues(`${folder}/deployment.yml`),
    Shell.printFileContents(`${folder}/deployment.yml`),
    // Create Kong service manifest files
    Shell.replaceEnvPlaceHolderValues(`${folder}/service.yml`),
    Shell.printFileContents(`${folder}/service.yml`),
    // Create Kong ingress manifest file
    Shell.replaceEnvPlaceHolderValues(`${folder}/ingress.yml`),
    Shell.printFileContents(`${folder}/ingress.yml`),
    // Assume eks deploy role
    ...Shell.assumeAwsRole(EKS_DEPLOY_ROLE),
    Kubectl.login(),
    Kubectl.applyFolder(folder)
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