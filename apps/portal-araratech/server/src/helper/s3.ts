import aws from "aws-sdk";
import fs from "fs";

const s3 = new aws.S3({
  // signatureVersion: "v4",
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function bucket() {
  return await s3.listBuckets().promise();
}

export namespace bucket {
  export async function items(bucket: string) {
    return await s3.listObjects({ Bucket: bucket }).promise();
  }

  export async function create(name: string) {
    return await s3.createBucket({ Bucket: name }).promise();
  }

  export async function deleteBucket(name: string) {
    const items = await s3.listObjects({ Bucket: name }).promise();

    if (items?.Contents?.length) {
      await s3
        .deleteObjects({
          Bucket: name,
          Delete: {
            Objects: items.Contents.map((x) => {
              return { Key: x.Key };
            }),
          },
        })
        .promise();
    }

    return await s3.deleteBucket({ Bucket: name }).promise();
  }
}

export async function upload({
  bucket,
  file,
}: {
  bucket: string;
  file: { path: string; originalname: string; mimetype: string };
}) {
  const content = fs.readFileSync(file.path);
  return await s3
    .putObject({
      Bucket: bucket,
      Key: file.originalname,
      Body: content,
      ContentType: file.mimetype,
    })
    .promise();
}

export async function deleteFile({
  bucket,
  filename,
}: {
  bucket: string;
  filename: string;
}) {
  return await s3
    .deleteObjects({
      Bucket: bucket,
      Delete: { Objects: [{ Key: filename }] },
    })
    .promise();
}

export function signedURL({
  filename,
  bucket,
  expires,
  acl,
}: {
  filename: string;
  bucket?: string;
  expires?: number;
  acl?: string;
}) {
  return new Promise<string>((resolve, reject) => {
    s3.getSignedUrl(
      "putObject",
      {
        Expires: expires || 3600,
        Bucket: bucket || process.env.AWS_BUCKET,
        Key: filename,
        ...(acl && { ACL: acl }),
      },
      (err, url) => {
        err ? reject(err) : resolve(url);
      },
    );
  });
}
