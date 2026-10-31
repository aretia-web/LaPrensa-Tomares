#!/usr/bin/env python3
"""
Actualiza el catálogo de la web a partir de un Excel (.xlsx) o un CSV.

Uso:
    python3 herramientas/actualizar_catalogo.py catalogo-semana.xlsx
    python3 herramientas/actualizar_catalogo.py catalogo-semana.csv
    python3 herramientas/actualizar_catalogo.py --plantilla      (crea una plantilla Excel vacía)
    python3 herramientas/actualizar_catalogo.py --comprobar      (solo revisa data/catalogo.csv)

Qué hace:
  1. Lee el archivo (primera hoja si es Excel).
  2. Reconoce las columnas aunque tengan otro nombre o mayúsculas/tildes
     (p. ej. "Artículo" = producto, "Familia" = categoría, "PVP" = precio).
  3. Avisa de errores: filas sin nombre, productos repetidos, precios raros…
  4. Si no hay errores, sobrescribe data/catalogo.csv (separado por ";").

Solo necesita Python 3. Para leer .xlsx hace falta openpyxl
(pip install openpyxl).
"""
from __future__ import annotations

import csv
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "catalogo.csv"
COLUMNAS = ["seccion", "categoria", "producto", "formato", "precio", "disponible", "destacado", "imagen"]

# Nombres alternativos que puede traer el catálogo del proveedor/dueño
ALIAS = {
    "seccion": ["seccion", "tipo", "zona"],
    "categoria": ["categoria", "familia", "grupo", "departamento", "seccion tienda"],
    "producto": ["producto", "articulo", "nombre", "descripcion", "item"],
    "formato": ["formato", "unidad", "presentacion", "envase", "medida"],
    "precio": ["precio", "pvp", "importe", "precio venta", "p.v.p.", "euros"],
    "disponible": ["disponible", "stock", "hay", "disponibilidad"],
    "destacado": ["destacado", "oferta", "promocion", "novedad"],
    "imagen": ["imagen", "foto", "url imagen"],
}
SI = {"si", "s", "x", "1", "yes", "y", "true", "verdadero"}
NO = {"no", "n", "0", "false", "falso", "agotado"}


def plegar(texto: object) -> str:
    t = "" if texto is None else str(texto)
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn").strip().lower()


def leer_filas(ruta: Path) -> list[list[str]]:
    if ruta.suffix.lower() in {".xlsx", ".xlsm"}:
        try:
            import openpyxl
        except ImportError:
            sys.exit("Para leer Excel instala openpyxl:  pip install openpyxl\n"
                     "o guarda el Excel como CSV (Archivo > Guardar como > CSV).")
        libro = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
        hoja = libro.worksheets[0]
        return [["" if v is None else str(v) for v in fila] for fila in hoja.iter_rows(values_only=True)]

    datos = ruta.read_bytes()
    for codificacion in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            texto = datos.decode(codificacion)
            break
        except UnicodeDecodeError:
            continue
    primera = texto.splitlines()[0] if texto else ""
    separador = max([";", ",", "\t"], key=primera.count)
    return list(csv.reader(texto.splitlines(), delimiter=separador))


def mapear_cabecera(cabecera: list[str]) -> dict[str, int]:
    mapa: dict[str, int] = {}
    plegada = [plegar(c) for c in cabecera]
    for campo, alias in ALIAS.items():
        for i, nombre in enumerate(plegada):
            if nombre in alias and i not in mapa.values():
                mapa[campo] = i
                break
    return mapa


def normalizar_precio(valor: str) -> tuple[str, str | None]:
    v = valor.replace("€", "").replace(" ", "").strip()
    if not v:
        return "", None
    if "," in v and "." in v:
        v = v.replace(".", "")
    v = v.replace(",", ".")
    try:
        n = float(v)
    except ValueError:
        return valor.strip(), f"precio «{valor}» no es un número (se mostrará tal cual)"
    if n <= 0:
        return "", None
    return f"{n:.2f}".replace(".", ","), None


def procesar(filas: list[list[str]]) -> tuple[list[dict], list[str], list[str]]:
    errores: list[str] = []
    avisos: list[str] = []
    # Busca la fila de cabecera (la primera que contenga una columna de producto)
    inicio = next((i for i, f in enumerate(filas) if "producto" in mapear_cabecera(f)), None)
    if inicio is None:
        return [], ["No encuentro la columna del nombre del producto. "
                    "La primera fila debe tener una columna llamada «producto» (o «artículo», «nombre»…)."], []
    mapa = mapear_cabecera(filas[inicio])
    faltan = [c for c in ("categoria",) if c not in mapa]
    if faltan:
        avisos.append("No hay columna «categoria»: todos los productos irán a «Otros».")

    productos: list[dict] = []
    vistos: dict[str, int] = {}
    for n, fila in enumerate(filas[inicio + 1:], start=inicio + 2):
        def col(campo: str) -> str:
            i = mapa.get(campo)
            return fila[i].strip() if i is not None and i < len(fila) and fila[i] is not None else ""

        if not any(str(c).strip() for c in fila):
            continue
        nombre = col("producto")
        if not nombre:
            errores.append(f"Fila {n}: falta el nombre del producto.")
            continue

        seccion = "encargo" if plegar(col("seccion")).startswith("encarg") else "tienda"
        precio, aviso = normalizar_precio(col("precio"))
        if aviso:
            avisos.append(f"Fila {n} ({nombre}): {aviso}.")

        disp = plegar(col("disponible"))
        if disp and disp not in SI | NO:
            avisos.append(f"Fila {n} ({nombre}): «disponible» = «{col('disponible')}»; se toma como «si».")
        dest = plegar(col("destacado"))

        clave = plegar(f"{seccion}|{nombre}|{col('formato')}")
        if clave in vistos:
            errores.append(f"Fila {n}: «{nombre}» está repetido (ya aparece en la fila {vistos[clave]}).")
            continue
        vistos[clave] = n

        productos.append({
            "seccion": seccion,
            "categoria": col("categoria") or "Otros",
            "producto": nombre,
            "formato": col("formato"),
            "precio": precio,
            "disponible": "no" if disp in NO else "si",
            "destacado": "si" if dest in SI else "",
            "imagen": col("imagen"),
        })
    if not productos and not errores:
        errores.append("El archivo no tiene ningún producto.")
    return productos, errores, avisos


def escribir(productos: list[dict]) -> None:
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    with DESTINO.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS, delimiter=";", lineterminator="\n")
        w.writeheader()
        w.writerows(productos)


def crear_plantilla(ruta: Path) -> None:
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    libro = openpyxl.Workbook()
    hoja = libro.active
    hoja.title = "Catalogo"
    hoja.append(COLUMNAS)
    ejemplos = [
        ["tienda", "Básicos", "Leche entera 1 L", "Por unidad", "1,15", "si", "si", ""],
        ["tienda", "Bebidas", "Agua mineral 1,5 L", "Pack de 6", "", "si", "", ""],
        ["encargo", "Electrónica", "Cargador USB-C", "Por unidad", "", "si", "", ""],
    ]
    for e in ejemplos:
        hoja.append(e)
    for celda in hoja[1]:
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor="1B3CC4")
    anchos = [11, 24, 36, 16, 10, 12, 12, 30]
    for i, a in enumerate(anchos):
        hoja.column_dimensions[chr(65 + i)].width = a
    hoja.freeze_panes = "A2"
    for rango, opciones in (("A2:A1000", '"tienda,encargo"'), ("F2:F1000", '"si,no"'), ("G2:G1000", '"si,no"')):
        dv = DataValidation(type="list", formula1=opciones, allow_blank=True)
        hoja.add_data_validation(dv)
        dv.add(rango)

    ayuda = libro.create_sheet("Instrucciones")
    for linea in [
        ["Columna", "Qué poner"],
        ["seccion", "«tienda» si está en la tienda, «encargo» si se pide al proveedor (vacío = tienda)."],
        ["categoria", "Agrupa los productos en la web (Básicos, Bebidas, Droguería…)."],
        ["producto", "Nombre que verá el cliente. Obligatorio."],
        ["formato", "Por unidad, Pack de 6, Por kilo… (opcional)."],
        ["precio", "Precio orientativo en euros, p. ej. 1,15 (opcional; vacío = no se muestra)."],
        ["disponible", "«no» si esta semana está agotado (se muestra pero no se puede reservar)."],
        ["destacado", "«si» para que salga en «Destacados» con una etiqueta roja."],
        ["imagen", "Opcional: ruta a una foto (assets/img/productos/leche.jpg) o URL."],
    ]:
        ayuda.append(linea)
    ayuda.column_dimensions["A"].width = 14
    ayuda.column_dimensions["B"].width = 100
    libro.save(ruta)


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in {"-h", "--help"}:
        print(__doc__)
        return
    if args[0] == "--plantilla":
        ruta = RAIZ / "data" / "plantilla-catalogo.xlsx"
        crear_plantilla(ruta)
        print(f"Plantilla creada en {ruta.relative_to(RAIZ)}")
        return

    origen = DESTINO if args[0] == "--comprobar" else Path(args[0])
    if not origen.exists():
        sys.exit(f"No encuentro el archivo {origen}")

    productos, errores, avisos = procesar(leer_filas(origen))
    for a in avisos:
        print(f"  Aviso: {a}")
    if errores:
        print("\nHay errores; no se ha cambiado el catálogo:")
        for e in errores:
            print(f"  - {e}")
        sys.exit(1)

    tienda = sum(p["seccion"] == "tienda" for p in productos)
    encargo = len(productos) - tienda
    agotados = sum(p["disponible"] == "no" for p in productos)
    cats = sorted({p["categoria"] for p in productos if p["seccion"] == "tienda"})
    print(f"\n{len(productos)} productos correctos: {tienda} en tienda, {encargo} de encargo, {agotados} agotados.")
    print(f"Categorías: {', '.join(cats)}")

    if args[0] != "--comprobar":
        escribir(productos)
        print(f"\nCatálogo guardado en {DESTINO.relative_to(RAIZ)}. Ahora sube los cambios (git commit + git push).")


if __name__ == "__main__":
    main()
