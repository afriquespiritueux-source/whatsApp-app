const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();
app.use(express.json());
app.use(express.static('public'));

cloudinary.config({ 
  cloud_name: 'isg597un', 
  api_key: '258228953483391', 
  api_secret: 'bfaUrIGG7trkMEs0QTLTP7XDz-g', 
  secure: true 
});

const upload = multer({ storage: multer.memoryStorage() });
const VERIFY_TOKEN = "mon_token_secret_123";
const WHATSAPP_TOKEN = "EAATttGsWz8kBS4xuTKZApLUgEuBSHUfwna0625yZCZBA3XjegLWCUU3shk9qbnkrkH8XPMklAOBcnloH3ssoOdABmn1R1vHDiCYnpV7XhAAZCUchuV12SeMYUogtJZAJdpAfNG5c3hy2frZA5YiqJiQOIO1lGJcYW2wWqeutWBLS7uveBMnsqJBi30hJbrpwZDZD"; 
const PHONE_NUMBER_ID = "1360862047116900";
const SUPABASE_URL = "https://nppaqxfbsjtiguakfkat.supabase.co";
const SUPABASE_KEY = "sb_publishable_AndUnPjRmEA4Q7fsm037Kg_mkmFkN2W";

async function getProfilePicture(number) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v21.0/${number}?fields=profile_picture_url`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        return response.data.profile_picture_url || null;
    } catch (error) { return null; }
}

// Fonction pour marquer un message comme lu (coches bleues)
async function markAsRead(messageId) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId
        }, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
    } catch (error) { console.error("Erreur markAsRead:", error.message); }
}

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            const value = body.entry[0].changes[0].value;
            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                const from = message.from;
                const name = value.contacts[0].profile.name;
                const text = message.text ? message.text.body : "[Média]";
                const waMessageId = message.id; // ID du message pour les coches
                
                const photoUrl = await getProfilePicture(from);

                // 1. Sauvegarder le message avec son ID
                await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
                    contact_number: from,
                    contact_name: name,
                    direction: 'inbound',
                    content: text,
                    profile_picture: photoUrl,
                    wa_message_id: waMessageId
                }, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }
                });

                // 2. Marquer comme lu (coches bleues chez le client)
                await markAsRead(waMessageId);
            }
        }
        res.sendStatus(200);
    } catch (error) { res.sendStatus(500); }
});

app.post('/api/send', async (req, res) => {
    const { to, text } = req.body;
    try {
        const waResponse = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

        const waMessageId = waResponse.data.messages[0].id;

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: text, wa_message_id: waMessageId
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Route pour uploader ta propre photo de profil
app.post('/api/upload-my-photo', upload.single('image'), async (req, res) => {
    try {
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(req.file.buffer);
        });

        await axios.patch(`${SUPABASE_URL}/rest/v1/my_profile?id=eq.1`, {
            profile_picture_url: result.secure_url
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true, url: result.secure_url });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/send-image', upload.single('image'), async (req, res) => {
    const { to } = req.body;
    try {
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(req.file.buffer);
        });

        const waResponse = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'image', image: { link: result.secure_url }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

        const waMessageId = waResponse.data.messages[0].id;

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: '[Image envoyée]', wa_message_id: waMessageId
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/public/app.html'); });
app.listen(process.env.PORT || 10000);
