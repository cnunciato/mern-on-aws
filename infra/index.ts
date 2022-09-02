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

// --- Create Frontend via S3 ---
const frontendBuild = new local.Command("frontend-build", {
    dir: "../frontend",
    // --- Windows ---
    // create: pulumi.interpolate `SET VITE_API_URL=${backendUrl} && npm install && npm run build`,
    // --- Linux/OSX ---
    create: pulumi.interpolate `export VITE_API_URL=https://${backendUrl} && npm install && npm run build`,
});

export const buildOutput = frontendBuild.stdout;

const bucketName = "frontend-bucket";
const bucket = new aws.s3.Bucket(bucketName, {
    website: {
        indexDocument: "index.html",
    },
    acl: "public-read",
});

const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: bucket.bucket,
    policy: {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: "*",
          Action: [
            "s3:GetObject"
          ],
          Resource: [
            pulumi.interpolate `arn:aws:s3:::${bucket.bucket}/*` // policy refers to bucket name explicitly
          ]
        }]
    },
});

const siteDir = "../frontend/dist";


// frontendBuild.stdout.apply(out => {
//     new aws.s3.BucketObject("index.html", {
//         bucket: bucket,
//         source: new pulumi.asset.FileAsset(path.join(siteDir, "index.html")),
//         contentType: mime.getType("index.html") || undefined,
//     });

//     // Upload assets
//     for (let item of fs.readdirSync(siteDir + "/assets")) {
//         let filePath = path.join(siteDir, "assets", item);
//         let object = new aws.s3.BucketObject("assets/" + item, {
//             bucket: bucket,
//             source: new pulumi.asset.FileAsset(filePath),
//             contentType: mime.getType(filePath) || undefined,
//         });
//     }
// });

// Upload index.html


export const website = bucket.websiteEndpoint;
