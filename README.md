# Latrode

Tienda de ropa deportiva. Es una página estática (GitHub Pages) con un panel de administrador que guarda los cambios directamente en este repositorio.

```
latrode/
├── index.html      la tienda y el panel de administrador
├── productos.lt    el catálogo (texto plano, editable a mano)
└── img/            las fotos de los productos
```

## 1. Crear el repositorio

1. Entra a https://github.com con la cuenta **BJZR**.
2. Arriba a la derecha pulsa **+** → **New repository**.
3. En **Repository name** escribe exactamente `latrode` (en minúsculas).
4. Elige **Public**.
5. Pulsa **Create repository**.

## 2. Subir los archivos

1. En la página del repositorio pulsa **uploading an existing file** (o **Add file** → **Upload files**).
2. Arrastra `index.html` y `productos.lt`.
3. Pulsa **Commit changes**.
4. Para la carpeta `img/`: pulsa **Add file** → **Create new file**, en el nombre escribe `img/.gitkeep` (al escribir la `/` se crea la carpeta) y pulsa **Commit changes**.

## 3. Activar GitHub Pages

1. En el repositorio ve a **Settings** (pestaña de arriba).
2. En el menú de la izquierda pulsa **Pages**.
3. En **Build and deployment** → **Source** elige **Deploy from a branch**.
4. En **Branch** elige `main` y la carpeta `/ (root)`. Pulsa **Save**.
5. Espera 1 o 2 minutos. Tu tienda quedará en:

   **https://bjzr.github.io/latrode/**

## 4. Crear el token de acceso

El token es la "llave" que permite al panel guardar cambios en tu repositorio.

1. Arriba a la derecha pulsa tu **foto de perfil** → **Settings**.
2. En el menú de la izquierda, hasta abajo, pulsa **Developer settings**.
3. Pulsa **Personal access tokens** → **Fine-grained tokens**.
4. Pulsa **Generate new token**.
5. Llena el formulario:
   - **Token name:** `latrode-panel`
   - **Expiration:** elige el plazo que quieras (máximo 1 año). Cuando venza, creas uno nuevo.
   - **Resource owner:** BJZR
   - **Repository access:** **Only select repositories** → elige `BJZR/latrode`
6. En **Permissions** pulsa **Repository permissions** y busca:
   - **Contents** → cámbialo a **Read and write**
   - **Metadata** queda en *Read-only* (se pone solo).
   - No actives ningún otro permiso.
7. Pulsa **Generate token**.
8. Copia el token (empieza con `github_pat_`). **GitHub lo muestra una sola vez.** Si lo pierdes, creas otro.

## 5. Conectar el panel

1. Abre https://bjzr.github.io/latrode/
2. Pulsa el menú (las tres rayas) → **Administrar tienda**.
3. Llena:
   - **Repositorio:** `BJZR/latrode`
   - **Rama:** `main`
   - **Token:** pega el token
4. Pulsa **Conectar**.

El token queda guardado solo en ese dispositivo. Para quitarlo usa **Cerrar sesión de GitHub** al final del panel.

## 6. Configurar la tienda

En el panel, en **Ajustes de la tienda**:

1. Escribe el **WhatsApp** con indicativo, sin signos. Ejemplo: `573044863455`.
2. Escribe tu número de **Nequi**.
3. Pulsa **Guardar ajustes y publicar**.

## Uso diario

- **Agregar:** llena el formulario y pulsa **Agregar y publicar**.
- **Editar:** pulsa **Editar** en la lista, cambia lo que quieras y pulsa **Guardar y publicar**.
- **Borrar:** pulsa **Borrar** y luego **¿Seguro?**.
- Cada acción hace un commit en el repositorio. Los clientes ven el cambio en 1 o 2 minutos. Tú lo ves al instante.

## Formato de `productos.lt`

```
[tienda]
whatsapp = 573044863455
nequi = 3000000000

[p1]
nombre = Camiseta Dry Fit
categoria = Camisetas
para = unisex
precio = 49900
descripcion = Tela liviana que seca rápido.
tallas = XS, S, M, L, XL
colores = Negro:#15171c, Blanco:#f2f2f2
foto = p1-abc123.jpg
```

- Cada producto empieza con su identificador entre corchetes.
- `para` acepta: `masculino`, `femenino` o `unisex`.
- `foto` es el nombre del archivo dentro de `img/`. Es opcional.
- Las líneas que empiezan con `#` son comentarios.

## Seguridad

- **Nunca compartas el token** ni lo pegues en el código, en un mensaje o en el repositorio.
- Si crees que alguien lo vio: **Settings → Developer settings → Fine-grained tokens**, abre el token y pulsa **Revoke**. Luego crea uno nuevo.
- El token solo tiene permiso sobre `latrode`, así que no afecta tus otros repositorios.

## Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| `Token inválido` | El token venció o está mal copiado. Crea otro. |
| `Sin permiso: revisa token y repositorio` | Revisa que el token sea para `BJZR/latrode` y que **Contents** esté en *Read and write*. |
| `No se pudo verificar` | Revisa que el repositorio sea `BJZR/latrode` y que la rama exista (`main`). |
| Cambié algo y no se ve | Espera 2 minutos y recarga. Puedes ver el avance en la pestaña **Actions** del repositorio. |
| Aparecen solo 8 productos de ejemplo | `productos.lt` no se encontró. Revisa que esté en la raíz del repositorio. |
