import { NEXUS_REPOSITORY, NEXUS_PASSWORD_SSM_KEY, NEXUS_USERNAME_SSM_KEY } from "./constants";

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
  hostname?:string,
  path?:string
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

  static setDeploymentEnvs (props:KubeEnvProps):string[] {
    const path = (props.path !== undefined) ? props.path : props.service
    const deployment = props.service + `-$(echo $${props.version})`
    const dockerImage = `${props.account}.dkr.ecr.${props.region}.amazonaws.com/${props.service}:$${props.version}`

    const commands = [
      Shell.setEnvironmentVar('namespace', props.namespace),
      Shell.setEnvironmentVar('service', props.service),
      Shell.setEnvironmentVar('service-headless', props.service.concat('-service-hl')),
      Shell.setEnvironmentVar('deployment', deployment),
      Shell.setEnvironmentVar('path', path),
      Shell.setEnvironmentVar('docker_image', dockerImage),
    ]

    if (props.hostname !== undefined) {
      commands.push(Shell.setEnvironmentVar('hostname', props.hostname))
    }

    return commands
  }

  static setNamespaceEnv (value:string) {
    return Shell.setEnvironmentVar('namespace', value)
  }

  static setServiceEnv (value:string) {
    return Shell.setEnvironmentVar('service', value)
  }

  static setHeadlessServiceEnv (value:string) {
    return Shell.setEnvironmentVar('service-headless', value)
  }

  static setDeploymentEnv (value:string) {
    return Shell.setEnvironmentVar('deployment', value)
  }

  static setHostnameEnv (value:string) {
    return Shell.setEnvironmentVar('hostname', value)
  }

  static setDockerImageEnv (value:string) {
    return Shell.setEnvironmentVar('docker_image', value)
  }

  static setEnvironmentVar(varname:string, value:string) {
    return `${varname}=${value}`
  }

  static replaceEnvPlaceHolderValues (filepath:string) {
    return `eval "echo \\"$(cat ${filepath})\\"" > ${filepath}`
  }

  static createImage (account:string, region:string, service:string, versionTag:string) {
    return `${account}.dkr.ecr.${region}.amazonaws.com/${service}:$${versionTag}`
  }

  static createDeployment (repositoryName:string, version:string) {
    return repositoryName + `-$(echo $${version})`
  }

  static printFileContents (filepath:string) {
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

