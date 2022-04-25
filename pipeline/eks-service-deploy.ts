import * as constructs from 'constructs';
import * as cdk8s from 'cdk8s';
import { CfnParameter, Stack, StackProps } from 'aws-cdk-lib';

import { ImagePullPolicy } from 'cdk8s-plus-17';
import { multiplyMoneyK8sSecret, validEnvironmentNames, } from '../lib/constants';
import { FargateCluster } from 'aws-cdk-lib/aws-eks';

import { Container,
  ContainerPort,
  EnvVar,
  IntOrString,
  KubeDeployment,
  KubeService,
  Quantity,
  SecurityContext,
  Volume,
  VolumeMount,
} from '../vendor/cdk8s/k8s';


interface stackProps extends StackProps {
  ecrRegion: string
  ecrAccount: string
  prodEksClusterName: string
  nonProdEksClusterName: string
}

export class EcsServiceDeploy extends Stack {
  constructor(scope: constructs.Construct, id: string, props: stackProps) {
    super(scope, id, props);

    const projectParam = new CfnParameter(this, 'project', {
      type: 'String',
      description: 'Service name to deploy, should correspond to github project name',
      default: process.env.MMD_PROJECT_NAME ?? '',
    });

    const selectorParam = new CfnParameter(this, 'selector', {
      type: 'String',
      description: 'K8s Deployment/Service selector, used to match K8s services to K8s deployments',
      default: process.env.MMD_DEPLOYMENT_SELECTOR ?? '',
    });

    const tagParam = new CfnParameter(this, 'tag', {
      type: 'String',
      description: 'Deployment version/tag',
      default: process.env.MMD_TAG ?? '',
    });

    const environmentParam = new CfnParameter(this, 'environment', {
      type: 'String',
      description: 'Deployment environment, must correspond to K8s namespace',
      default: process.env.MMD_ENVIRONMENT ?? '',
      allowedValues: validEnvironmentNames,
    });

    const actionParam = new CfnParameter(this, 'action', {
      type: 'String',
      description: 'Action type, must be deploy or release. Default is deploy',
      default: process.env.MMD_ACTION_TYPE ?? 'deploy',
      allowedValues: ['deploy', 'release'],
    });

    const ecrUriParam = new CfnParameter(this, 'ecr-uri', {
      type: 'String',
      description: 'Ecr repository URI excluding tag',
      default: `${props.ecrAccount}.dkr.ecr.${props.ecrRegion}.amazonaws.com/${projectParam.valueAsString}`,
    });

    const replicasParam = new CfnParameter(this, 'replicas', {
      type: 'Number',
      description: 'K8s deployment replicas, defaults to 1',
      default: 1,
    });

    const validateRequiredParams = (): string | undefined => {
      if(!projectParam.valueAsString || projectParam.valueAsString == '') {
        return `required [project] parameter to be provided. project: ${projectParam.description}`;
      }

      if(!selectorParam.valueAsString || selectorParam.valueAsString == '') {
        return `required [selector] parameter to be provided. selector: ${selectorParam.description}`;
      }

      if(!tagParam.valueAsString || tagParam.valueAsString == '') {
        return `required [tag] parameter to be provided. tag: ${tagParam.description}`;
      }

      if(!environmentParam.valueAsString || environmentParam.valueAsString == '') {
        return `required [environment] parameter to be provided. environment: ${environmentParam.description}`;
      }

      if(replicasParam.valueAsNumber < 1) {
        return `replicas parameter needs a value > 0. replicas: ${replicasParam.description}`;
      }

      return undefined;
    };

    let validationErr = validateRequiredParams();
    if (validationErr) {
      throw Error(validationErr);
    }

    const cluster = FargateCluster.fromClusterAttributes(this, 'EksCluster', {
      clusterName: environmentParam.valueAsString == 'prod' ? props.prodEksClusterName : props.nonProdEksClusterName,
    });

    const project = projectParam.valueAsString;
    const selector = selectorParam.valueAsString;

    switch (actionParam.valueAsString) {
      case 'release':
        const service = new ServiceChart(new cdk8s.App(), {
          project,
          selector,
        });
        cluster.addCdk8sChart(projectParam.valueAsString, service);
        break;

      case 'deploy':
        const deployment = new DeploymentChart(new cdk8s.App(), {
          project,
          selector,
          environment: environmentParam.valueAsString,
          tag: tagParam.valueAsString,
          ecrRepositoryUri: ecrUriParam.valueAsString,
        });
        cluster.addCdk8sChart(projectParam.valueAsString, deployment);
        break;

      default:
        throw Error(`Unrecognized deployment action, expected action to be one of [deploy, release]`);
    }
  };
};

interface serviceChartValues {
  project: string
  selector: string
}

export class ServiceChart extends cdk8s.Chart {
  constructor(scope: constructs.Construct, props: serviceChartValues) {
    super(scope, props.project);

    const labels = { 
      project: props.project,
      app: props.project,
      'target-deployment': props.selector,
    };

    const selector = {
      'app.kubernetes.io/instance': props.selector,
    };

    const ports = [
      {
        name: 'http',
        port: 8080,
        protocol: 'TCP',
      },
      {
        name: 'https',
        port: 8443,
        protocol: 'TCP',
      },
      {
        name: 'management',
        port: 9990,
        protocol: 'TCP',
      }
    ];

    new KubeService(this, `${props.project}Service`, {
      metadata: {
        name: `${props.project}-service`,
        labels,
      },
      spec: {
        selector,
        ports,
      }
    });

    /**
     * TODO Investigate the following
     *  Headless services do not expose a load balanced dns name in the clusterIP
        Rather the IP's are encoded as SRV records in DNS.
        Kong makes use of this to learn which pods are behind a service
     */
    new KubeService(this, `${props.project}ServiceHeadless`, {
      metadata: {
        name: `${props.project}-service-hl`,
        labels,
      },
      spec: {
        selector,
        ports,
        clusterIp: 'None',
        type: 'ClusterIP',
      }
    });
  }
};

interface deploymentChartValues {
  tag: string
  project: string
  selector: string
  environment: string
  ecrRepositoryUri: string
  component?: string
  replicas?: number
}

export class DeploymentChart extends cdk8s.Chart {
  constructor(scope: constructs.Construct, props: deploymentChartValues) {
    super(scope, props.project);

    const metadata = {
      name: `${props.selector}`,
      labels: {
        project: props.project,
        app: props.project,
        'target-deployment': props.selector,
      },
    }

    const selector = {
      matchLabels: {
        'app.kubernetes.io/instance': props.selector,
      }
    };

    const annotations = {
      'co.elastic.logs/multiline.pattern': '^\t.*',
      'co.elastic.logs/multiline.negate': 'true',
      'co.elastic.logs/multiline.match': 'after',
      'prometheus.io/path': '/metrics',
      'prometheus.io/port': '8001',
      'prometheus.io/scheme': 'http',
      'prometheus.io/scrape': 'true',
    };

    const labels = {
      'app.kubernetes.io/name': props.project,
      'app.kubernetes.io/instance': props.selector,
      'app.kubernetes.io/version': props.tag,
      'app.kubernetes.io/component': props.component ?? 'microservice',
      'app.kubernetes.io/part-of': 'banking',
    };

    new KubeDeployment(this, `${props.project}Deployment`, {
      metadata,
      spec: {
        replicas: props.replicas,
        selector,
        template: {
          metadata: {
            labels,
            annotations,
          },
          spec: {
            containers: [
              buildDefaultContainerSpec({
                tag: props.tag,
                selector: props.selector,
                project: props.project,
                image: `${props.ecrRepositoryUri}:${props.tag}`,
                environment: props.environment,
              }),
            ],
            volumes,
          }
        }
      }
    });
  }
};

interface defaultContainerProps {
  tag: string
  image: string
  project: string
  selector: string
  environment: string
  cpuRequest?: string
  cpuLimit?: string
  memRequest?: string,
  memLimit?: string
}

const buildDefaultContainerSpec = (props: defaultContainerProps): Container => {
  const container: Container = {
    name: props.selector,
    image: props.image,
    ports,
    volumeMounts,
    securityContext,
    imagePullPolicy: ImagePullPolicy.IF_NOT_PRESENT,
    env: defaultContainerEnv(props.project, props.environment, props.tag),
    resources: {
      requests: {
        'cpu': Quantity.fromString(props.cpuRequest ?? '30m'),
        'memory': Quantity.fromString(props.memRequest ?? '768M'),
      },
      limits: {
        'cpu': Quantity.fromString(props.cpuLimit ?? '750m'),
        'memory': Quantity.fromString(props.memLimit ?? '768M'),
      }
    },
    readinessProbe: {
      httpGet: {
        path: `/${props.project}`,
        port: IntOrString.fromNumber(8080),
      },
      initialDelaySeconds: 120,
      timeoutSeconds: 10,
      periodSeconds: 25,
      successThreshold: 1,
      failureThreshold: 10,
    },
    livenessProbe: {
      httpGet: {
        path: `/${props.project}`,
        port: IntOrString.fromNumber(8080),
      },
      failureThreshold: 3,
      initialDelaySeconds: 600,
      timeoutSeconds: 10,
      periodSeconds: 20,
    },
  };

  return container;
};

const volumes: Volume[] = [
  {
    name: 'timezone-config',
    hostPath: {
      path: '/etc/localtime',
    },
  },
  {
    name: 'wildfly-data',
    emptyDir: {}
  },
  {
    name: 'wildfly-log',
    emptyDir: {}
  },
  {
    name: 'wildfly-tmp',
    emptyDir: {}
  }
];

const volumeMounts: VolumeMount[] = [
  {
    name: 'timezone-config',
    mountPath: '/etc/localtime',
  },
  {
    name: 'wildfly-data',
    mountPath: '/opt/wildfly/standalone/data',
  },
  {
    name: 'wildfly-log',
    mountPath: '/opt/wildfly/standalone/log',
  },
  {
    name: 'wildfly-tmp',
    mountPath: '/opt/wildfly/standalone/tmp',
  },
];

const ports: ContainerPort[] = [
  {
    name: 'http',
    containerPort: 8080,
    protocol: 'TCP',
  },
  {
    name: 'https',
    containerPort: 8443,
    protocol: 'TCP',
  }
];

const securityContext: SecurityContext = {
  runAsNonRoot: true,
  runAsUser: 431,
  runAsGroup: 433,
  allowPrivilegeEscalation: false,
  capabilities: {
    drop: ['all']
  }
};

const defaultContainerEnv = (project: string, environment: string, tag: string): EnvVar[] => ([
  {
    name: 'MMI_ENV',
    value: environment,
  },
  {
    name: 'BUILDNUMBER',
    value: tag,
  },
  {
    name: 'IMAGENAME',
    value: project,
  },
  {
    name: 'oauth_sharedsecret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'oauth_sharedsecret',
        optional: true,
      },
    },
  },
  {
    name: 'audit_allowedApplications',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'audit_allowedApplications',
        optional: true,
      },
    },
  },
  {
    name: 'audit_signingprivatekeypassword',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'audit_signingprivatekeypassword',
        optional: true,
      },
    },
  },
  {
    name: 'audit_signingprivatekeystorepassword',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'audit_signingprivatekeystorepassword',
        optional: true,
      },
    },
  },
  {
    name: 'forensics_authorizationstring',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'forensics_authorizationstring',
        optional: true,
      },
    },
  },
  {
    name: 'hazelcast_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'hazelcast_password',
        optional: true,
      },
    },
  },
  {
    name: 'kong_credentials',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'kong_credentials',
        optional: true,
      },
    },
  },
  {
    name: 'kong_admin_credentials',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'kong_admin_credentials',
        optional: true,
      },
    },
  },
  {
    name: 'momentum_credentials',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'momentum_credentials',
        optional: true,
      },
    },
  },
  {
    name: 'momentum_points_feed_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'momentum_points_feed_password',
        optional: true,
      },
    },
  },
  {
    name: 'momentum_points_feed_username',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'momentum_points_feed_username',
        optional: true,
      },
    },
  },
  {
    name: 'retailsts_authorizationstring',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'retailsts_authorizationstring',
        optional: true,
      },
    },
  },
  {
    name: 'sso_keystorepassword',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'sso_keystorepassword',
        optional: true,
      },
    },
  },
  {
    name: 'transactionverificationservice_authorizationstring',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'transactionverificationservice_authorizationstring',
        optional: true,
      },
    },
  },
  {
    name: 'wallet_mongo_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'wallet_mongo_password',
        optional: true,
      },
    },
  },
  {
    name: 'audit_mongo_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'audit_mongo_password',
        optional: true,
      },
    },
  },
  {
    name: 'money_settings_provider_mongo_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'money_settings_provider_mongo_password',
        optional: true,
      },
    },
  },
  {
    name: 'traderoot_soap_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'traderoot_soap_password',
        optional: true,
      },
    },
  },
  {
    name: 'inbox_mongo_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'inbox_mongo_password',
        optional: true,
      },
    },
  },
  {
    name: 'info_mongo_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'info_mongo_password',
        optional: true,
      },
    },
  },
  {
    name: 'setting_provider_client_authorization',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'setting_provider_client_authorization',
        optional: true,
      },
    },
  },
  {
    name: 'aws_notificationservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_notificationservices_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_notificationservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_notificationservices_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'aws_pfmservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_pfmservices_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_pfmservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_pfmservices_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'aws_moneymanagementforensics_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_moneymanagementforensics_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_moneymanagementforensics_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_moneymanagementforensics_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'money_services_pfm_sync_user_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'money_services_pfm_sync_user_id',
        optional: true,
      },
    },
  },
  {
    name: 'money_services_pfm_sync_user_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'money_services_pfm_sync_user_password',
        optional: true,
      },
    },
  },
  {
    name: 'kong_consumer_batch_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'kong_consumer_batch_client_id',
        optional: true,
      },
    },
  },             
  {
    name: 'aws_documents_services_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_documents_services_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_documents_services_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_documents_services_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'kong_consumer_batch_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'kong_consumer_batch_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'CCD_sftpuser',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'CCD_sftpuser',
        optional: true,
      },
    },
  },
  {
    name: 'CCD_sftphost',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'CCD_sftphost',
        optional: true,
      },
    },
  },
  {
    name: 'CCD_sftppassword',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'CCD_sftppassword',
        optional: true,
      },
    },
  },
  {
    name: 'CCD_uploadUser',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'CCD_uploadUser',
        optional: true,
      },
    },
  },
  {
    name: 'aws_transaction_event_services_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_transaction_event_services_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_transaction_event_services_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_transaction_event_services_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'aws_pfm_databridge_services_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_pfm_databridge_services_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_pfm_databridge_services_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_pfm_databridge_services_client_secret',
        optional: true,
      },
    },
  },
  {
    name: 'aws_authenticationservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_authenticationservices_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_authenticationservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_authenticationservices_client_secret',
        optional: true,
      },
    },
  },      
  {
    name: 'auth_mongoUser',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'auth_mongoUser',
        optional: true,
      },
    },
  },
  {
    name: 'auth_mongoPassword',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'auth_mongoPassword',
        optional: true,
      },
    },
  },     
  {
    name: 'aws_transactionlistener_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_transactionlistener_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_transactionlistener_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_transactionlistener_client_secret',
        optional: true,
      },
    },
  },        
  {
    name: 'aws_transactionservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_transactionservices_client_id',
        optional: true,
      },
    },
  },
  {
    name: 'aws_transactionservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_transactionservices_client_secret',
        optional: true,
      },
    },
  },               
  {
    name: 'bankservservices_mongodb_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'bankservservices_mongodb_password',
        optional: true,
      },
    },
  },
  {
    name: 'retailClientUsername',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'retailClientUsername',
        optional: true,
      },
    },
  },               
  {
    name: 'retailClientPassword',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'retailClientPassword',
        optional: true,
      },
    },
  },               
  {
  name: 'aws_ussdservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_ussdservices_client_id',
        optional: true,
      },
    },
  },               
  {
  name: 'aws_ussdservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_ussdservices_client_secret',
        optional: true,
      },
    },
  },    
  {
  name: 'aws_paymentservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_paymentservices_client_id',
        optional: true,
      },
    },
  },
  {
  name: 'aws_paymentservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_paymentservices_client_secret',
        optional: true,
      },
    },
  },
  {
  name: 'mongo_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'mongo_password',
        optional: true,
      },
    },
  },    
  {
  name: 'aws_sftpmonitorservices_client_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_sftpmonitorservices_client_id',
        optional: true,
      },
    },
  },                                    
  {
  name: 'aws_sftpmonitorservices_client_secret',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'aws_sftpmonitorservices_client_secret',
        optional: true,
      },
    },
  },
  {
  name: 'retail_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'retail_password',
        optional: true,
      },
    },
  },
  {
  name: 'retail_username',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'retail_username',
        optional: true,
      },
    },
  },
  {
  name: 'itouch_user_id',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'itouch_user_id',
        optional: true,
      },
    },
  },
  {
  name: 'itouch_password',
    valueFrom: {
      secretKeyRef: {
        name: multiplyMoneyK8sSecret,
        key: 'itouch_password',
        optional: true,
      },
    },
  },
]);
