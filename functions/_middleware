export async function onRequest(context) {
  const { request, env } = context;

  // 1. Detectar el país de la petición
  // Cloudflare detecta la ubicación automáticamente
  const country = request.cf?.country;

  // 2. Bloqueo si no es Chile (CL)
  if (country !== 'CL') {
    return new Response(
      "Acceso no permitido: Esta aplicación solo está disponible en Chile.", 
      { 
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }

  // 3. Rate Limiter (Opcional: solo funciona si configuras el binding en el panel)
  if (env.MY_RATE_LIMITER) {
    const { success } = await env.MY_RATE_LIMITER.limit({ 
      key: request.headers.get("cf-connecting-ip") || "global" 
    });
    
    if (!success) {
      return new Response("Has excedido el límite de peticiones. Intenta más tarde.", { 
        status: 429 
      });
    }
  }

  // 4. Si pasa las reglas, continuar con la carga del sitio
  return await context.next();
}
