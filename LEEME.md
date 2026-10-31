# Minimarket La Prensa · web

Web estática (HTML, CSS y JS, sin dependencias) para que los clientes vean el
catálogo de la semana, **reserven** productos y los **recojan y paguen en la tienda**.
No hay pago online: cada reserva llega por correo (Web3Forms) con nombre, teléfono,
día de recogida y lista de productos.

```
index.html                 página
assets/css/styles.css      estilos
assets/js/config.js        ajustes: origen del catálogo, horario, clave de correo
assets/js/main.js          catálogo, buscador, carrito y envío de reservas
data/catalogo.csv          EL CATÁLOGO (la "base de datos")
data/plantilla-catalogo.xlsx   plantilla Excel para rellenar
herramientas/actualizar_catalogo.py   convierte Excel/CSV → data/catalogo.csv
```

## Actualizar el catálogo cada semana

El catálogo es una tabla con estas columnas (separadas por `;`):

| columna      | qué poner                                                         | obligatoria |
|--------------|-------------------------------------------------------------------|-------------|
| `seccion`    | `tienda` (lo hay en la tienda) o `encargo` (se pide al proveedor) | no (tienda) |
| `categoria`  | Básicos, Bebidas, Droguería y perfumería… (crea los filtros)      | recomendable |
| `producto`   | nombre que verá el cliente                                        | **sí**      |
| `formato`    | Por unidad, Pack de 6, Por kilo…                                  | no          |
| `precio`     | precio orientativo, p. ej. `1,15` (vacío = no se muestra)         | no          |
| `disponible` | `no` si está agotado esta semana (se ve pero no se puede reservar) | no (si)    |
| `destacado`  | `si` para que salga en «Destacados» con etiqueta roja             | no          |
| `imagen`     | ruta (`assets/img/productos/leche.jpg`) o URL de una foto         | no          |

### Opción A · con la herramienta (recomendada)

1. Pasa el catálogo del dueño a la plantilla `data/plantilla-catalogo.xlsx`
   (o usa directamente su Excel/CSV: la herramienta entiende columnas como
   «Artículo», «Familia», «PVP», «Stock»…).
2. Ejecuta:
   ```bash
   python3 herramientas/actualizar_catalogo.py catalogo-semana.xlsx
   ```
   Te avisa de filas sin nombre, productos repetidos o precios raros. Si todo
   está bien, sobrescribe `data/catalogo.csv`.
3. Revisa en local y publica:
   ```bash
   python3 -m http.server 8000
   ```
   ```bash
   git add data/catalogo.csv && git commit -m "Catálogo semana" && git push
   ```

La fecha «Actualizado el …» del catálogo sale sola de la fecha del archivo publicado.

### Opción B · con una Hoja de cálculo de Google (sin tocar código cada semana)

1. Crea una hoja con las mismas columnas (puedes importar la plantilla).
2. *Archivo › Compartir › Publicar en la Web*, elige la hoja y formato **CSV**.
3. Pega la URL en `assets/js/config.js` → `catalogoUrl`, y publica ese cambio una vez.

A partir de ahí, lo que cambies en la hoja aparece en la web en unos minutos.

> Nota: abrir `index.html` con doble clic no carga el catálogo (el navegador
> bloquea leer archivos locales). Usa `python3 -m http.server` para probar.

## Reservas

- Las reservas llegan al correo de la cuenta de Web3Forms cuya clave está en
  `assets/js/config.js` (`web3formsKey`).
- El correo separa lo que hay que **preparar en tienda** de los **encargos**
  (hay que llamar al cliente para confirmar precio y plazo).
- El carrito se guarda en el navegador del cliente; si un producto desaparece
  del catálogo o se marca como agotado, se quita solo de su reserva.

## Horario

Se edita en `assets/js/config.js` (`horario`) y en la tabla de la sección
«Horario» de `index.html`. Con él se calcula el aviso «Abierto ahora / Cerrado»
y los días que se ofrecen para recoger.
