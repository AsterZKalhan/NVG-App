import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

const VAPID_PUBLIC_KEY = 'BPsir4XP8frRCjKIWrnNcXKEe48Zwe5GnNoSQbJcOwe1QORyaO7Opu8xHjMOHiavPm85OFKXlFBWBqbX-KgttbI';
const VAPID_PRIVATE_KEY = 'kJmfl5cZKjJ_wFhev0lTUz9w4nBUQo1PESA9F1U9zHM'; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

webpush.setVapidDetails(
  'mailto:admin@nvg-tv.fr',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

serve(async (req) => {
  // Réponse immédiate pour les requêtes de vérification CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const record = payload.record || {}
    const title = record.title || "Normandy Viking Gaming"
    const body = record.body || "Nouvelle information du Valhalla !"

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: subscriptions, error } = await supabase
      .from('nvg_subscriptions')
      .select('*')

    if (error || !subscriptions) {
      return new Response(JSON.stringify({ error: error }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    console.log(`Diffusion de la notification à ${subscriptions.length} appareil(s)...`)

    const notificationPayload = JSON.stringify({
      title: title,
      body: body,
      icon: 'https://app.nvg-tv.com/Logos/favicon.png'
    })

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        if (!sub.subscription) return
        await webpush.sendNotification(sub.subscription, notificationPayload)
        console.log(`Push envoyé avec succès à l'utilisateur : ${sub.user_id}`)
      } catch (err) {
        console.error(`Erreur d'envoi pour l'abonné ${sub.user_id}:`, err)
      }
    })

    await Promise.all(sendPromises)

    return new Response(JSON.stringify({ success: true, count: subscriptions.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})