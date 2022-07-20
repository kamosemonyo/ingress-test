import { dockerCreateBuildArgs } from "../pipeline_stage/eks-deployment";
import { K8sDeployProps } from "../pipeline_stage/k8sdeploy";
import { NEXUS_REPOSITORY, NEXUS_PASSWORD_SSM_KEY, NEXUS_USERNAME_SSM_KEY, ECR_REGION, DEV_VERSION, RELEASE_VERSION, K8S_VERSION, K8S_TEMPLATES_BUCKET_NAME, EKS_DEPLOY_ROLE, ENV_PROD } from "./constants";
import { Kubectl } from "./kubctl";
import { getClusterName, getServiceTagVersion } from "./util";

const GH_VERSION = '2.4.0';
const KUBECTL_VERSION = '1.15.0';
const YQ_VERSION = 'v4.25.1';
const YQ_BINARY = 'yq_linux_amd64'
const CLUSTER_REPO = 'aws-eks';
const CLUSTER_YML_CONFIG_PATH = 'cluster/services.yml';

interface KubeEnvProps {
  account:string,
  region:string,
  namespace:string,
  service:string,
  version:string,
  env:string,
  hostname?:string,
  path?:string
}

const k8sVars = {
  namespace: 'namespace',
  service: 'service',
  service_headless: 'service_headless',
  deployment: 'deployment',
  path: 'path',
  docker_image: 'docker_image',
  version: 'version',
  env: 'env',
  hostname: 'hostname'
}

export class Shell {
  static installCdkCmd: string[] = [
    'echo "Installing AWS CDK"',
    'npm install -g aws-cdk@1.122.0 typescript',
    'cdk --version',
  ];

  static installJq: string[] = [
    'echo "Installing Jq"',
    'apt install jq',
    'apt install gettext',
  ];

  static debugEnvCmd = [
    'env',
    'ls -al',
  ];

  static setupMvnSettings = (region: string):string[] => [
    `mkdir -p ~/.m2`,
    `export NEXUS_REPOSITORY=${NEXUS_REPOSITORY}`,
    `export NEXUS_USERNAME=$(aws ssm get-parameter --name "${NEXUS_USERNAME_SSM_KEY}" --region ${region} --output json | jq -r '.[].Value')`,
    `export NEXUS_PASSWORD=$(aws ssm get-parameter --name "${NEXUS_PASSWORD_SSM_KEY}" --with-decryption --region ${region} --output json | jq -r '.[].Value')`,
    `echo \" ${getMvnSettingsTemplate()}\" > ~/.m2/settings.tmpl.xml`,
    `envsubst < ~/.m2/settings.tmpl.xml > ~/.m2/settings.xml`,
  ];

  static javaVersion ():string {
    return 'java -version'
  }

  static mvnVersion ():string {
    return 'mvn -version'
  }

  static mvnCleanInstall ():string {
    return `mvn clean install`
  }

  static mvnDeploy ():string {
    return `mvn deploy`
  }

  static setVersionFromFile (propertiesFilePath:string):string[] {
    return [
      `export ${DEV_VERSION}=\`grep -oP \'version=\\K.*\' ${propertiesFilePath}\``,
      `echo "current new snapshot version $${DEV_VERSION}"`,
      'export VERSION=$(echo ${SNAPSHOT_VERSION} |awk -F "-" \'{print $1}\')',
      'echo "Resolved new version $VERSION"',
      `echo $${RELEASE_VERSION} > VERSION`,
      `cp ${propertiesFilePath} docker/files`
    ]
  }

  static installGithubCLI = ():string[] => [
    `echo \"Installing Github CLI v${GH_VERSION} in $PWD/bin\"`,
    `mkdir -p bin`,
    `curl -LO https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz`,
    `tar -xzf gh_${GH_VERSION}_linux_amd64.tar.gz`,
    `mv gh_${GH_VERSION}_linux_amd64/bin/gh bin/`
  ];  

  static installKubectl = ():string[] => [
    `echo \"Installing Kubectl v${KUBECTL_VERSION} in $PWD/bin\"`,
    `mkdir -p bin`,
    `curl -L https://storage.googleapis.com/kubernetes-release/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl -o bin/kubectl`,
    `chmod +x bin/kubectl`
  ];

  static installYq = ():string[] => [
    `echo "Installing Yq v${YQ_VERSION}"`,
    'sudo apt update',
    `wget https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/${YQ_BINARY} -O /usr/bin/yq`,
    `chmod +x /usr/bin/yq`,
    'yq --version',
    'yq --help'
  ];

  static dockerBuildAndDeploy (params:K8sDeployProps):string[] {
    const serviceTagVersion = getServiceTagVersion(params.environment)
    let buildCommand = Shell.buildDockerImage(params.account, params.repositoryName, serviceTagVersion)

    if (params.dockerBuildArg !== undefined) {
      buildCommand = buildCommand.concat(
        dockerCreateBuildArgs(params.dockerBuildArg)
      )
    }

    const pushImageCommands = (params.environment !== ENV_PROD) ? [
      Shell.ecrLogin(params.account),
      buildCommand,
      Shell.dockerPush(params.account, params.repositoryName, serviceTagVersion)
    ]: []

    return pushImageCommands
  }

  static  eksDeployServiceToK8s (params:K8sDeployProps):string[] {
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
        version: serviceTagVersion,
        hostname: params.host
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

  static envbustVersion():string {
    return 'envsubst --version'
  }

  static updateCluster = (repo:string , env:string, githubOrg:string):string[] => [
    `git clone https://$GITHUB_AUTH_TOKEN@github.com/${githubOrg}/${CLUSTER_REPO}.git .crepo`,
    `cd .crepo`,
    'git config user.email \"cesadmins@mmiholdings.co.za\"',
    'git config user.name \"multiply-service\"',
    'git fetch',
    `git switch ${env}`,
    'git pull',
    `VERSION=$VERSION yq -i '.services.[] |= select(.repo == "${repo}").version= env(VERSION)' ${CLUSTER_YML_CONFIG_PATH}`,
    `git commit -am "update ${repo} to version $VERSION"`,
    `git tag -a ${repo}-$VERSION@${env} -m "update ${repo} to version $VERSION" `,
    'git push',
    'git push origin --tags',
    'rm -rf .crepo'
  ]

  static assumeAwsRole = (roleArn:string):string[] => {
    return [
      `OUT=$(aws sts assume-role --role-arn ${roleArn} --role-session-name AWSCLI-Session)`,
      "export AWS_ACCESS_KEY_ID=$(echo $OUT | jq -r '.Credentials''.AccessKeyId')",
      "export AWS_SECRET_ACCESS_KEY=$(echo $OUT | jq -r '.Credentials''.SecretAccessKey')",
      "export AWS_SESSION_TOKEN=$(echo $OUT | jq -r '.Credentials''.SessionToken')",
      'aws sts get-caller-identity',
    ]
  }

  static s3DownloadFolder (bucketName:string, destination:string) {
    return `aws s3 sync s3://${bucketName} ${destination}/`
  }

  static ecrLogin (account:string) {
    return `aws ecr get-login-password --region ${ECR_REGION} | docker login --username AWS --password-stdin ${account}.dkr.ecr.${ECR_REGION}.amazonaws.com`
  }

  static buildDockerImage (account:string, repositoryName:string, version:string) {
    return  `docker build -t ${Shell.toDockerImage(account, repositoryName, version)} .`
  }

  static dockerPush (account:string, repositoryName:string, version:string) {
    return `docker push ${Shell.toDockerImage(account, repositoryName, version)}`
  }

  static toDockerImage (account:string, repositoryName:string, version:string) {
    return `${account}.dkr.ecr.${ECR_REGION}.amazonaws.com/${repositoryName}:$${version}`
  }

  static setDeploymentEnvs (props:KubeEnvProps):string[] {
    const path = (props.path !== undefined) ? props.path : props.service
    const deployment = props.service + `-$(echo $${K8S_VERSION})`
    const dockerImage = Shell.toDockerImage(props.account, props.service, props.version)

    const commands = [
      Shell.exportEnvironmentVar(k8sVars.version, `$${props.version}`),
      Shell.setEnvironmentVar(K8S_VERSION, `$(echo "$${props.version}" | tr '[:upper:]' '[:lower:]'|  tr -d .)`),
      Shell.exportEnvironmentVar(k8sVars.namespace, props.namespace),
      Shell.exportEnvironmentVar(k8sVars.service, props.service),
      Shell.exportEnvironmentVar(k8sVars.service_headless, props.service.concat('-service-hl')),
      Shell.exportEnvironmentVar(k8sVars.deployment, deployment),
      Shell.exportEnvironmentVar(k8sVars.path, path),
      Shell.exportEnvironmentVar(k8sVars.docker_image, dockerImage),
      Shell.exportEnvironmentVar(k8sVars.env, props.env),
    ]

    if (props.hostname !== undefined) {
      commands.push(Shell.exportEnvironmentVar('hostname', props.hostname))
    }

    return commands
  }

  static replaceEnvPlaceHolderValues (filepath:string):string {
    const extensions = filepath.split('.')
    const extension = extensions[extensions.length - 1]

    return `envsubst < ${filepath} > tmp.${extension} && mv tmp.${extension} ${filepath}`
  }


  static setNamespaceEnv (value:string) {
    return Shell.exportEnvironmentVar('namespace', value)
  }

  static setServiceEnv (value:string) {
    return Shell.exportEnvironmentVar('service', value)
  }

  static setHeadlessServiceEnv (value:string) {
    return Shell.exportEnvironmentVar('service-headless', value)
  }

  static setDeploymentEnv (value:string) {
    return Shell.exportEnvironmentVar('deployment', value)
  }

  static setHostnameEnv (value:string) {
    return Shell.exportEnvironmentVar('hostname', value)
  }

  static setDockerImageEnv (value:string) {
    return Shell.exportEnvironmentVar('docker_image', value)
  }

  static exportEnvironmentVar(varname:string, value:string) {
    return `export ${varname}=${value}`
  }

  static setEnvironmentVar(varname:string, value:string) {
    return `${varname}=${value}`
  }

  static createImage (account:string, region:string, service:string, versionTag:string) {
    return `${account}.dkr.ecr.${region}.amazonaws.com/${service}:$${versionTag}`
  }

  static createDeployment (repositoryName:string, version:string) {
    return repositoryName + `-$(echo $${version})`
  }

  static printFileContents (filepath:string):string {
    return `cat ${filepath}`
  }
};

const getMvnSettingsTemplate = (): string => {
return `
<settings>
  <servers>
    <server>
      <id>nexus</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>momentum</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-central</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-thirdparty</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-releases</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-snapshots</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
  </servers>

  <profiles>
    <profile>
        <id>nexus</id>
        <repositories>
            <repository>
              <id>maven-public</id>
              <url>$NEXUS_REPOSITORY/repository/maven-public</url>
              <releases><enabled>true</enabled></releases>
              <snapshots><enabled>true</enabled></snapshots>
            </repository>
        </repositories>
        <pluginRepositories>
            <pluginRepository>
                <id>maven-public</id>
                <url>$NEXUS_REPOSITORY/repository/maven-public</url>
                <releases><enabled>true</enabled></releases>
                <snapshots><enabled>true</enabled></snapshots>
            </pluginRepository>
        </pluginRepositories>
    </profile>
  </profiles>
  <activeProfiles>
    <activeProfile>nexus</activeProfile>
  </activeProfiles>
</settings>
`
};

