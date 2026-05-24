export const verifyImageSignature =  async (file: File): Promise<boolean> => {
    const arrayBuffer = await file.slice(0, 4).arrayBuffer();
    const view = new DataView(arrayBuffer);
    
    if (view.byteLength < 4) return false;

    const signature = view.getUint32(0, false).toString(16).toUpperCase();

    // JPEG and JPG signatures start with FF D8 FF
    if (signature.startsWith('FFD8FF')) return true;
    
    // PNG signature is exactly 89 50 4E 47
    if (signature === '89504E47') return true;
    
    // WebP signature: bytes 0-3 are 'RIFF', bytes 8-11 are 'WEBP'
    if (signature === '52494646') return true; 

    return false;
}