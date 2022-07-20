import { ECR_REGION, EKS_DEPLOY_ROLE, K8S_TEMPLATES_BUCKET_NAME } from "../lib/constants";
import { Kubectl } from "../lib/kubctl";
import { Shell } from "../lib/shell";
import { getClusterName, getServiceTagVersion } from "../lib/util";
import { K8sDeployProps } from "./k8sdeploy";

export function  deployServiceToK8s (params:K8sDeployProps):string[] {
  const serviceTagVersion = getServiceTagVersion(params.environment)
  const service = params.repositoryName
  const clusterName = getClusterName(params.environment)

  const folder = '.service'

  return [
    Shell.s3DownloadFolder(K8S_TEMPLATES_BUCKET_NAME, folder),
    // Populate placeholder environment variables on templates
    ...Shell.setDeploymentEnvs({
      env: params.environment,
      account: params.account,
      region: ECR_REGION,
      namespace: params.environment,
      service: service,
      version: serviceTagVersion
    }),
    // Create deployment manifest file
    Shell.replaceEnvPlaceHolderValues(`${folder}/deployment.yml`),
    Shell.printFileContents(`${folder}/deployment.yml`),
    // Create service manifest files
    Shell.replaceEnvPlaceHolderValues(`${folder}/svc.yml`),
    Shell.printFileContents(`${folder}/svc.yml`),
    // Create headless service manifest file
    Shell.replaceEnvPlaceHolderValues(`${folder}/svc-headless.yml`),
    Shell.printFileContents(`${folder}/svc-headless.yml`),
    // Assume eks deploy role
    ...Shell.assumeAwsRole(EKS_DEPLOY_ROLE),
    Kubectl.login(clusterName),
    Kubectl.applyFolder(folder)
  ]
}

export function dockerCreateBuildArgs (args:any) {
  const keys = Object.keys(args)
  let command = ''
  for (let key of keys) {
    command = command.concat(` --build-arg ${key}=${args[key]}`)
  }

  return command
}