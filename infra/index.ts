import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { local } from "@pulumi/command";
import * as fs from "fs";
import * as path from "path";
import * as mime from "mime";

const config = new pulumi.Config();

// --- Create the DocumentDB Cluster ---
const dbCluster = new aws.docdb.Cluster("docdb", {
    backupRetentionPeriod: 1,
    clusterIdentifier: "docdb-cluster",
    skipFinalSnapshot: true,
    masterUsername: "doc",
    masterPassword: "database8chars",
});
const db = new aws.docdb.ClusterInstance(`clusterInstance`, {
    identifier: `docdb-cluster-inst`,
    clusterIdentifier: dbCluster.id,
    instanceClass: "db.t3.medium",
});

export const connString = pulumi.interpolate `mongodb://${dbCluster.masterUsername}:${dbCluster.masterPassword}@${dbCluster.endpoint}:${dbCluster.port}?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;

// --- App Runner for Backend ---
const defaultVpc = awsx.ec2.Vpc.getDefault();
const vpcConnector = new aws.apprunner.VpcConnector("vpc-connector", {
    vpcConnectorName: "vpc-connector",
    securityGroups: [ defaultVpc.vpc.defaultSecurityGroupId ],
    subnets: defaultVpc.publicSubnetIds,
});
let backendApp = new aws.apprunner.Service("backend-app", {
    serviceName: "backend-app",
    networkConfiguration: {
        egressConfiguration: {
            egressType: "VPC",
            vpcConnectorArn: vpcConnector.arn,
        }
    },
    sourceConfiguration: {
        authenticationConfiguration: {
            connectionArn: config.require( "gh_connection" ),
        },
        codeRepository: {
            codeConfiguration: {
                codeConfigurationValues: {
                    buildCommand: "cd backend && npm install && npm run build",
                    port: "8000",
                    runtime: "NODEJS_14",
                    startCommand: "npm run --prefix backend start",
                    runtimeEnvironmentVariables: {
                        BACKEND_SERVICE_PORT: "8000",
                        DATABASE_URL: connString,
                    }
                },
                configurationSource: "API",
            },
            repositoryUrl: config.require( "repo" ),
            sourceCodeVersion: {
                type: "BRANCH",
                value: "main",
            },
        },
    },
});

export const backendUrl = pulumi.interpolate `https://${backendApp.serviceUrl}`;

// --- App Runner for Frontend ---
const frontendApp = new aws.apprunner.Service("frontend-app", {
    serviceName: "frontend-app",
    networkConfiguration: {
        egressConfiguration: {
            egressType: "VPC",
            vpcConnectorArn: vpcConnector.arn,
        }
    },
    sourceConfiguration: {
        authenticationConfiguration: {
            connectionArn: config.require( "gh_connection" ),
        },
        codeRepository: {
            codeConfiguration: {
                codeConfigurationValues: {
                    buildCommand: pulumi.interpolate `export VITE_API_URL=${backendUrl} && cd frontend && npm install && npm run build`,
                    port: "5000",
                    runtime: "NODEJS_14",
                    startCommand: "npm run --prefix frontend preview -- --host --port 5000",
                    runtimeEnvironmentVariables: {
                    }
                },
                configurationSource: "API",
            },
            repositoryUrl: config.require( "repo" ),
            sourceCodeVersion: {
                type: "BRANCH",
                value: "main",
            },
        },
    },
});

export const website = pulumi.interpolate `https://${frontendApp.serviceUrl}`;
