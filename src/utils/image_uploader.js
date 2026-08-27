/**
 * Image Uploader Utility
 * Compresses images client-side and uploads to external image hosting (ImgBB)
 * to avoid storing heavy Base64 strings in Supabase and prevent Egress bandwidth overages.
 */

const IMGBB_API_KEY = 'e9039225186177f6adfb076f9f58a5c3'; // User ImgBB API key

/**
 * Compresses an image file/blob to a maximum width and given quality using HTML5 Canvas.
 * @param {File|Blob} file 
 * @param {number} maxWidth 
 * @param {number} quality 
 * @returns {Promise<string>} Base64 compressed image
 */
export function compressImage(file, maxWidth = 1000, quality = 0.72) {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image file or base64 data to external hosting (ImgBB).
 * Returns the hosted HTTPS image URL, or compressed base64 as offline fallback.
 * @param {File|Blob|string} imageInput 
 * @returns {Promise<string>} Hosted image URL (https://i.ibb.co/...) or fallback
 */
export async function uploadImage(imageInput) {
  if (!imageInput) return '';

  // If it's already a hosted URL, return as is
  if (typeof imageInput === 'string' && (imageInput.startsWith('http://') || imageInput.startsWith('https://'))) {
    return imageInput;
  }

  try {
    let base64Data = '';
    if (typeof imageInput === 'string' && imageInput.startsWith('data:image')) {
      base64Data = imageInput;
    } else if (imageInput instanceof Blob || imageInput instanceof File) {
      base64Data = await compressImage(imageInput, 1000, 0.72);
    }

    if (!base64Data) return '';

    // If online, upload to ImgBB
    if (navigator.onLine && IMGBB_API_KEY) {
      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const formData = new FormData();
      formData.append('image', cleanBase64);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        const url = json?.data?.display_url || json?.data?.url;
        if (url) {
          return url;
        }
      }
    }
    
    // Offline or upload error fallback: return compressed base64
    return base64Data;
  } catch (err) {
    console.warn('External image upload failed, falling back to local compressed:', err);
    if (typeof imageInput === 'string') return imageInput;
    return await compressImage(imageInput, 800, 0.65);
  }
}

/**
 * Scans local Dexie and Supabase for existing heavy Base64 images in tables,
 * uploads them to ImgBB, and updates the records with the lightweight URLs.
 */
export async function migrateExistingImagesToExternal(db, restFetch) {
  if (!navigator.onLine) return { migrated: 0 };
  let migratedCount = 0;

  // 1. Ganado
  try {
    const animales = await db.ganado.toArray();
    for (const a of animales) {
      if (a.image_url && a.image_url.startsWith('data:image')) {
        const hostedUrl = await uploadImage(a.image_url);
        if (hostedUrl && !hostedUrl.startsWith('data:image')) {
          a.image_url = hostedUrl;
          await db.ganado.put(a);
          if (restFetch) {
            try {
              await restFetch(`/rest/v1/ganado?id=eq.${a.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ image_url: hostedUrl })
              });
            } catch {}
          }
          migratedCount++;
        }
      }
    }
  } catch (e) { console.warn('Migration error ganado:', e); }

  // 2. Motores
  try {
    const motores = await db.motores.toArray();
    for (const m of motores) {
      if (m.image_url && m.image_url.startsWith('data:image')) {
        const hostedUrl = await uploadImage(m.image_url);
        if (hostedUrl && !hostedUrl.startsWith('data:image')) {
          m.image_url = hostedUrl;
          await db.motores.put(m);
          if (restFetch) {
            try {
              await restFetch(`/rest/v1/motores?id=eq.${m.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ image_url: hostedUrl })
              });
            } catch {}
          }
          migratedCount++;
        }
      }
    }
  } catch (e) { console.warn('Migration error motores:', e); }

  // 3. Herramientas
  try {
    const herramientas = await db.herramientas.toArray();
    for (const h of herramientas) {
      if (h.image_url && h.image_url.startsWith('data:image')) {
        const hostedUrl = await uploadImage(h.image_url);
        if (hostedUrl && !hostedUrl.startsWith('data:image')) {
          h.image_url = hostedUrl;
          await db.herramientas.put(h);
          if (restFetch) {
            try {
              await restFetch(`/rest/v1/herramientas?id=eq.${h.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ image_url: hostedUrl })
              });
            } catch {}
          }
          migratedCount++;
        }
      }
    }
  } catch (e) { console.warn('Migration error herramientas:', e); }

  // 4. Lote Aplicaciones (Plan IFCAFE)
  try {
    const aplicaciones = await db.lote_aplicaciones.toArray();
    for (const app of aplicaciones) {
      const isBase64Foto = app.foto_url && app.foto_url.startsWith('data:image');
      const isBase64Notas = app.notas && app.notas.startsWith('data:image');
      if (isBase64Foto || isBase64Notas) {
        const rawImg = isBase64Foto ? app.foto_url : app.notas;
        const hostedUrl = await uploadImage(rawImg);
        if (hostedUrl && !hostedUrl.startsWith('data:image')) {
          if (isBase64Foto) app.foto_url = hostedUrl;
          if (isBase64Notas) app.notas = hostedUrl;
          await db.lote_aplicaciones.put(app);
          if (restFetch) {
            try {
              await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${app.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  foto_url: isBase64Foto ? hostedUrl : (app.foto_url || null),
                  notas: isBase64Notas ? hostedUrl : (app.notas || null)
                })
              });
            } catch {}
          }
          migratedCount++;
        }
      }
    }
  } catch (e) { console.warn('Migration error aplicaciones:', e); }

  return { migrated: migratedCount };
}
