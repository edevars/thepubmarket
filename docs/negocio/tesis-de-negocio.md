# Tesis de negocio — The Pub Market

El norte estratégico. Si una decisión contradice este documento, la decisión está mal — o la tesis cambió y hay que reescribirla a conciencia. Léelo antes que cualquier otro doc de negocio.

> Este documento es deliberadamente honesto, incluso para un inversionista. Una tesis que solo presume el upside y esconde el techo es una mentira con buena tipografía. La fortaleza de esta apuesta **es** su honestidad: el downside está acotado y eso es lo que la hace buena.

---

## 1. La tesis en una frase

**The Pub Market no es una startup independiente; es infraestructura estratégica que multiplica el margen y el foso de The Pub Game Store, capturando además una tajada de las ventas de otros vendedores, todo a costo marginal cercano a cero.**

La riqueza no se crea en la plataforma sola. Se crea en el **ecosistema combinado** tienda física + plataforma. La plataforma es el multiplicador, no el motor.

---

## 2. Por qué esta apuesta tiene sentido

### a. El activo más caro ya está pagado
El costo más alto de cualquier marketplace es **conseguir el primer lado del mercado** (oferta y demanda simultáneas) y la **adquisición de clientes** (CAC). The Pub Game Store ya tiene:
- Inventario real de cartas (oferta inmediata → liquidez día uno).
- Una comunidad física de jugadores en CDMX (demanda con CAC ≈ $0).
- Reputación y confianza local (lo que un marketplace abierto tarda años en construir).

La plataforma arranca con el problema del "huevo y la gallina" **ya resuelto**.

### b. Asimetría riesgo/recompensa excelente
- **Downside ≈ cero.** Stack Cloudflare (~$300-800 MXN/mes), sin custodia de fondos (sin riesgo regulatorio de capital), sin inventario nuevo, operable por una persona. Lo único que se arriesga es tiempo.
- **Upside real aunque acotado.** Margen sobre GMV ajeno a costo marginal cero, más extensión digital del negocio físico.

Es, literalmente, una **opción barata**: pagas poco por el derecho a un upside concreto. Pocos proyectos tienen este perfil.

### c. La no-custodia es ventaja, no limitación
Operar con Stripe Connect *direct charges* mantiene a la plataforma fuera del flujo de fondos y, por tanto, **fuera de los requisitos IFPE de la Ley Fintech**. Esto elimina la barrera regulatoria y de capital que hundiría a un competidor que intente custodiar. Ver [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md).

### d. La curación es el foso
El modelo **vetted (por invitación, sin auto-registro)** sacrifica crecimiento de oferta a cambio de **confianza y calidad**. En un mercado donde el canal dominante es grupos de Facebook llenos de fraude, "todos los vendedores aquí están verificados" es un diferenciador defendible que un marketplace abierto no puede copiar sin volverse el bazar del que la gente huye.

---

## 3. El techo — y por qué está bien

Las mismas decisiones que hacen esta apuesta segura y operable le ponen techo:

| Decisión de diseño | Lo que protege | El techo que impone |
|---|---|---|
| Sellers vetted / no auto-registro | Confianza, calidad, mantenibilidad | Limita el crecimiento de la oferta → limita GMV |
| México-only | Foco, cumplimiento simple | TAM acotado |
| Nicho TCG (MTG primero) | Profundidad, comunidad | Mercado direccionable pequeño |
| Un operador | Costo casi nulo, sin burocracia | Riesgo de persona clave, sin paralelización |

**Esto no es un defecto del plan; es la consecuencia lógica de sus restricciones.** Dentro de estas restricciones, el negocio **no escala a riqueza venture-scale**, y está bien: no toda buena decisión es un cohete. El objetivo no es un unicornio; es un activo de alto retorno sobre capital que hace al ecosistema The Pub más valioso y defensible por casi nada.

### La pregunta correcta
No es *"¿esto me hace rico?"* — sino *"¿esto hace al ecosistema The Pub significativamente más valioso y defensible por casi nada?"* Ahí la respuesta es claramente **sí**.

---

## 4. De dónde sale el retorno

Dos caminos, y la tesis solo apuesta fuerte por uno:

1. **Flujo de caja (el camino fuerte):** comisión sobre GMV propio y de terceros, a costo marginal ~0. En escala, un ingreso sólido para un operador, complementario al retail de la tienda. Ver [`modelo-financiero.md`](./modelo-financiero.md).
2. **Valor de activo / salida (el camino débil):** los múltiplos de adquisición de marketplaces dependen de GMV creciente, oferta abierta y ausencia de persona clave — justo lo que la tesis restringe. **No se apuesta por una salida.** Si llega, es bono, no plan.

El verdadero riesgo no es perder dinero — es el **costo de oportunidad** del tiempo del operador. Por eso la disciplina de mantenerlo operable por una persona es parte de la tesis, no un detalle.

---

## 5. Qué rompería la tesis (señales de alerta)

Si te ves tentado a hacer cualquiera de estas cosas "para crecer", detente y relee este documento. Romperlas convierte una apuesta limpia en un negocio caro y riesgoso sin haberlo decidido a conciencia:

- 🚩 **Abrir el registro de sellers** ("para tener más oferta"). Mata la curación, que es el foso. Si la oferta es el cuello de botella, **invita más sellers vetted**, no abras las puertas.
- 🚩 **Custodiar fondos aunque sea "un momentito"** ("para controlar reembolsos / escrow"). Te mete en IFPE/Ley Fintech. Línea roja absoluta.
- 🚩 **Salir de México o del nicho TCG sin equipo** ("el TAM es chico"). Multiplica complejidad operativa y de cumplimiento más allá de lo que una persona sostiene.
- 🚩 **Contratar y construir estructura antes de que el GMV lo pague.** Convierte el downside ≈ cero en quema de capital.
- 🚩 **Salir del ecosistema Cloudflare sin justificación de dolor real.** Sube costo y carga de mantenimiento contra la regla de un operador.

Ninguna de estas está prohibida para siempre — pero ninguna se hace por impulso de crecimiento. Se hacen, si acaso, reescribiendo esta tesis primero.

---

## 6. Condiciones bajo las que la tesis cambiaría

Sería legítimo reconsiderar (y reescribir) la tesis si:
- El GMV de terceros (no The Pub Game Store) supera consistentemente al del ancla **y** la demanda de sellers vetted excede tu capacidad de invitarlos manualmente → quizá justifique estructura.
- Aparece un competidor abierto bien financiado que gana el mercado por volumen → habría que decidir entre defender el nicho premium o cambiar de juego.
- The Pub Game Store deja de ser el ancla (cierre, venta) → la tesis pierde su pilar; reevaluar de raíz.

Hasta entonces: **disciplina sobre crecimiento.** El plan es bueno *porque* es contenido.

---

*Relacionados: [`business-plan.md`](./business-plan.md) · [`modelo-financiero.md`](./modelo-financiero.md) · [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md). No es asesoría legal/fiscal formal.*
