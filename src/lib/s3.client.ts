import { S3Client } from "@aws-sdk/client-s3";
import { HTTPException } from "hono/http-exception";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { verifyImageSignature } from "./file-validator";
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
        process.env.NODE_ENV !== "production" ? console.log(`Successfully deleted ${objectKey} from R2`) : "";
    } catch (error) {
        process.env.NODE_ENV !== "production" ? console.error(`Failed to delete ${objectKey} from R2:`, error) : "";
        throw new HTTPException(500, { message: "Failed to delete image."});
    }
}

export const uploadPhoto = async (file: File, folder: string = "general"): Promise<string> => {
    
    if (!file || file.size === 0) {
        throw new HTTPException(400, { message: "O arquivo de imagem está vazio ou é inválido." });
    }

    const isValidFormat = await verifyImageSignature(file);
    if (!isValidFormat) {
         throw new HTTPException(400, { message: "O arquivo enviado foi mascarado e não é uma imagem real." });
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
    
        /*
       const webpBuffer = await sharp(arrayBuffer)
        .resize({ 
            width: 1080, 
            height: 1080, 
            fit: 'inside', // maintains aspect ratio 
            withoutEnlargement: true // don't upscale small images 
        })
        .webp({ quality: 80 }) // converts to webp at 80% quality
        .toBuffer(); */ 

        const webpBytes = await new Bun.Image(arrayBuffer)
            .resize(1080, 1080, { 
                fit: 'inside', 
                withoutEnlargement: true 
            })
            .webp({ quality: 80 })
            .bytes(); // .bytes() returns a Uint8Array, perfect for S3

        /* generate secure filename */
        const objectKey = `${folder}/${crypto.randomUUID()}.webp`;

        /* upload to R2 bucket */
        await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: objectKey,
            Body: webpBytes,
            ContentType: "image/webp",
        }));

        return `${process.env.R2_PUBLIC_URL}/${objectKey}`;
    } catch (error) {
        process.env.NODE_ENV !== "production" ? console.error("Failed to upload file to R2:", error) : "";
        throw new HTTPException(500, { message: "Failed to process and upload file" });
    }
}