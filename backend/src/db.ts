import * as path from "path";
import * as fs from "fs";
import * as mongodb from "mongodb";
import * as bson from "bson";

const conn = process.env.DATABASE_URL || "mongodb://127.0.0.1";
if (!conn) {
    process.exit(1);
}

// https://docs.aws.amazon.com/documentdb/latest/developerguide/ca_cert_rotation.html
export const client = new mongodb.MongoClient(conn, {
    sslCA: path.resolve("./rds-combined-ca-bundle.pem"),
});

export const findByID = (id: string) => ({ _id: new bson.ObjectID(id) });
