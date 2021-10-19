import { nexusRepository } from "./constants";

export class CommonCommands {
  static installCdkCmd: string[] = [
    'echo "Installing AWS CDK"',
    'npm install -g aws-cdk@1.122.0 typescript',
    'cdk --version',
  ];

  static installJq: string[] = [
    'echo "Installing Jq"',
    'apt-get update',
    'apt install jq',
    'apt install gettext',
  ];

  static debugEnvCmd = [
    'env',
    'ls -al',
  ];

  static setupMvnSettings = (region: string) => setupMvnSettings(region);
};

const setupMvnSettings = (region: string): string[] => {
  return [
    `mkdir -p ~/.m2`,
    `export NEXUS_REPOSITORY=${nexusRepository}`,
    `export NEXUS_USERNAME=$(aws ssm get-parameter --name "/mmi/nexus/username" --region ${region} --output json | jq '.[].Value')`,
    `export NEXUS_PASSWORD=$(aws ssm get-parameter --name "/mmi/nexus/password" --with-decryption --region ${region} --output json | jq '.[].Value')`,
    `echo ${getMvnSettingsTemplate()} > ~/.m2/settings.tmpl.xml`,
    `envsubst < ~/.m2/settings.tmpl.xml > ~/.m2/settings.xml`
  ];
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