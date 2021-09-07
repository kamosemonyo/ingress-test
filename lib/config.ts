import { ISubnet } from '@aws-cdk/aws-ec2';


export interface environmentConfig {
  vpcId: string
  subnetIds: string[]
  availabilityZones: string[]
}

const afSouth1availabilityZones: string[] = [
  'af-south-1a',
  'af-south-1b',
  'af-south-1c	'
];

const devConfig: environmentConfig = {
  vpcId: 'vpc-0a0d1561f5e68084a',
  availabilityZones: afSouth1availabilityZones,
  subnetIds: [
    'subnet-0c1acaf0c2e0e7cd7',
    'subnet-0ff037502318663ef',
    'subnet-0f69643b00b06b18e',
  ]
};

const preConfig: environmentConfig = {
  vpcId: 'vpc-0a0d1561f5e68084a',
  availabilityZones: afSouth1availabilityZones,
  subnetIds: [
    'subnet-0c1acaf0c2e0e7cd7',
    'subnet-0ff037502318663ef',
    'subnet-0f69643b00b06b18e',
  ]
};

const prodConfig: environmentConfig = {
  vpcId: '', // TODO add vpcID
  availabilityZones: afSouth1availabilityZones,
  subnetIds: [], // TODO add subnets
};

const configForEnvironment = new Map<string, environmentConfig>([
  ['dev',  devConfig],
  ['pre',  preConfig],
  ['prod', prodConfig],
]);
