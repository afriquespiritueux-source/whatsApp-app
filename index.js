const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚠️ CONFIGURATION (À REMPLIR ABSOLUMENT)
cloudinary.config({ 
  cloud_name: 'isg597un', 
  api_key: '258228953483391',     // <-- À REMPLACER
  api_secret: 'bfaUrIGG7trkMEs0QTLTP7XDz-g', // <-- À REMPLACER
  secure: true 
});
const upload = multer({ storage: multer.memoryStorage() });
const WHATSAPP_TOKEN = "EAATttGsWz8kBS8dmMrUQjA8Kzsmd7VRaOfrPnZBYfloGJfJeAeK4IIBfx7mSluqBVESctdTz94zWrXHd0GNotUGeCzXWFgi10qUi8usNb7g9jolwSFTdMaO4TPfCUlhWhMEnG3vADHZA1d8ZBDFpyGXiOmSebnTGZACA1zpIoZB7ZBwBriqYhgXsbaZCxsU6wZDZD"; // <-- À REMPLACER
const PHONE_NUMBER_ID = "1360862047116900";
const SUPABASE_URL = "https://nppaqxfbsjtiguakfkat.supabase.co";
const SUPABASE_KEY = "sb_publishable_AndUnPjRmEA4Q7fsm037Kg_mkmFkN2W";
const VERIFY_TOKEN = "mon_token_secret_123";

console.log("Démarrage du serveur...");

// Récupérer la photo de profil du client
async function getProfilePicture(number) {
    try {
        const res = await axios.get(`https://graph.facebook.com/v21.0/${number}?fields=profile_picture_url`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        return res.data.profile_picture_url || null;
    } catch (e) { 
        console.log("Erreur photo de profil :", e.message);
        return null; 
    }
}

// 1. VERIFICATION WEBHOOK (Meta)
app.get('/webhook', (req, res) => {
    console.log("Vérification Webhook reçue...");
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log("Webhook validé !");
        res.send(req.query['hub.challenge']);
    } else {
        console.log("Erreur Webhook : Token invalide.");
        res.sendStatus(403);
    }
});

// 2. RECEPTION DES MESSAGES (Texte et Images)
app.post('/webhook', async (req, res) => {
    console.log("--- Nouveau message reçu ---");
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            const value = body.entry[0].changes[0].value;
            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                let text = message.text ? message.text.body : "[Média]";
                let mediaUrl = null;

                // Si c'est une image, on la télécharge et on l'envoie sur Cloudinary
                if (message.image) {
                    text = "[Image reçue]";
                    console.log("Récupération de l'image depuis Meta...");
                    try {
                        // 1. Obtenir le lien de l'image via Meta
                        const mediaRes = await axios.get(`https://graph.facebook.com/v21.0/${message.image.id}`, {
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                        });
                        const imageUrl = mediaRes.data.url;
                        
                        // 2. Télécharger l'image
                        const imageBuffer = await axios.get(imageUrl, {
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
                            responseType: 'arraybuffer'
                        });
                        
                        // 3. Uploader sur Cloudinary
                        const result = await new Promise((resolve, reject) => {
                            cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                                if (error) reject(error); else resolve(result);
                            }).end(imageBuffer.data);
                        });
                        mediaUrl = result.secure_url;
                        console.log("Image sauvegardée sur Cloudinary :", mediaUrl);
                    } catch (imgError) {
                        console.log("Erreur lors du traitement de l'image :", imgError.message);
                    }
                }

                const photoUrl = await getProfilePicture(message.from);

                await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
                    contact_number: message.from,
                    contact_name: value.contacts[0].profile.name,
                    direction: 'inbound',
                    content: text,
                    profile_picture: photoUrl,
                    is_read: false,
                    media_url: mediaUrl
                }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });
                
                console.log("Message enregistré dans Supabase !");
            }
        }
        res.sendStatus(200);
    } catch (error) { 
        console.log("ERREUR réception :", error.message);
        res.sendStatus(500); 
    }
});

// 3. ENVOI DE TEXTE
app.post('/api/send', async (req, res) => {
    const { to, text } = req.body;
    console.log("--- Tentative d'envoi de texte à", to, "---");
    try {
        const waRes = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
        
        console.log("Meta a accepté le message !");

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: text, wa_message_id: waRes.data.messages[0].id, is_read: true
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { 
        console.log("ERREUR ENVOI TEXTE :", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Erreur d'envoi" }); 
    }
});

// 4. ENVOI DE PHOTO
app.post('/api/send-image', upload.single('image'), async (req, res) => {
    const { to } = req.body;
    console.log("--- Tentative d'envoi de média à", to, "---");
    try {
        console.log("Upload vers Cloudinary...");
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(req.file.buffer);
        });
        console.log("Cloudinary OK :", result.secure_url);

        console.log("Envoi à Meta...");
        const waRes = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'image', image: { link: result.secure_url }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
        console.log("Meta a accepté l'image !");

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: '[Image envoyée]', wa_message_id: waRes.data.messages[0].id, is_read: true, media_url: result.secure_url
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { 
        console.log("ERREUR ENVOI IMAGE :", error.message);
        res.status(500).json({ error: error.message }); 
    }
});

// 5. MARQUER COMME LU (pour les badges)
app.post('/api/mark-read', async (req, res) => {
    const { contact_number } = req.body;
    try {
        await axios.patch(`${SUPABASE_URL}/rest/v1/messages?contact_number=eq.${contact_number}&direction=eq.inbound`, {
            is_read: true
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/public/app.html'); });
app.listen(process.env.PORT || 10000, () => { console.log("Serveur prêt !"); });
