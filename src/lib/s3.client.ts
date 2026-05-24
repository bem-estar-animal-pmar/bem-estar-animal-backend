import { S3Client } from "@aws-sdk/client-s3";
import { HTTPException } from "hono/http-exception";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from 'sharp';

if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.warn("Missing R2 environment variables. File uploads will fail.");
}

export const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

export const deletePhoto = async (photoUrl: string) => {
    if (!photoUrl) {
        return;
    }

    const baseUrl = process.env.R2_PUBLIC_URL || "";
    const objectKey = photoUrl.replace(`${baseUrl}/`, "");

    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: objectKey,
        }));
        console.log(`Successfully deleted ${objectKey} from R2`);
    } catch (error) {
        console.error(`Failed to delete ${objectKey} from R2:`, error);
        throw new HTTPException(500, { message: "Failed to delete image."});
    }
}

export const uploadPhoto = async (file: File, folder: string = "general"): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
    
        const webpBuffer = await sharp(arrayBuffer)
            .resize({ 
                width: 1080, 
                height: 1080, 
                fit: 'inside', /* maintains aspect ratio */
                withoutEnlargement: true /* don't upscale small images */
            })
            .webp({ quality: 80 }) /* converts to webp at 80% quality */
            .toBuffer();

        /* generate secure filename */
        const objectKey = `${folder}/${crypto.randomUUID()}.webp`;

        /* upload to R2 bucket */
        await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: objectKey,
            Body: webpBuffer,
            ContentType: "image/webp",
        }));

        return `${process.env.R2_PUBLIC_URL}/${objectKey}`;
    } catch (error) {
        console.error("Failed to upload file to R2:", error);
        throw new HTTPException(500, { message: "Failed to process and upload file" });
    }
}