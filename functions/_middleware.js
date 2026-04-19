export async function onRequest(context) {
  const { request, env } = context;

  // 1. Identificar el país y el tipo de visitante (User Agent)
  const country = request.cf?.country;
  const userAgent = request.headers.get("user-agent") || "";

  // 2. Lista de excepciones para que WhatsApp y RRSS puedan leer la imagen de la agenda
  const isSocialBot = userAgent.includes("WhatsApp") || 
                      userAgent.includes("facebookexternalhit") || 
                      userAgent.includes("LinkedInBot") ||
                      userAgent.includes("Twitterbot");

  // 3. Bloqueo por País (Si NO es Chile y NO es un bot de redes sociales)
  if (country && country !== 'CL' && !isSocialBot) {
    return new Response(
      "Acceso no permitido: Esta aplicación solo está disponible en Chile.", 
      { 
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }

  // 4. Rate Limiter (Binding MY_RATE_LIMITER)
  // Protege contra bots de spam que intenten llenar la agenda
  if (env.MY_RATE_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") || "global";
    const { success } = await env.MY_RATE_LIMITER.limit({ key: ip });
    
    if (!success) {
      return new Response("Has excedido el límite de peticiones. Intenta más tarde.", { 
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  }

  // 5. Si todo está en orden, cargar el index.html del taller
  return await context.next();
}
