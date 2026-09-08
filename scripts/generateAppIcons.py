#!/usr/bin/env python3
"""Gera os icones do app (PWA, apple-touch-icon e AppIcon do iOS) a partir de public/logo3.png.

Uso:
    pip install Pillow
    python3 scripts/generateAppIcons.py

A logo original tem muita area transparente ao redor; o script recorta o conteudo
real e o redesenha centralizado sobre o fundo da marca, ocupando a maior parte da
arte. Assim o icone nao aparece "pequeno" na tela de inicio do celular.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'logo3.png'
PUBLIC = ROOT / 'public'
IOS_APPICON = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'

# Fundo branco: a logo tem o simbolo em cinza escuro e o wordmark em dourado,
# que rendem mais sobre claro do que sobre o preto do app. Usamos cor solida (e nao
# transparencia) porque icone de iOS nao pode ter canal alpha e no Android o fundo
# transparente fica por conta do launcher.
BACKGROUND = (255, 255, 255)


def load_trimmed_logo() -> Image.Image:
    """Abre a logo e remove as bordas transparentes."""
    logo = Image.open(SOURCE).convert('RGBA')
    mask = logo.getchannel('A').point(lambda value: 255 if value > 10 else 0)
    box = mask.getbbox()
    if box is None:
        raise SystemExit('logo3.png nao tem conteudo visivel')
    return logo.crop(box)


def render_icon(logo: Image.Image, size: int, coverage: float, opaque: bool) -> Image.Image:
    """Desenha a logo centralizada ocupando `coverage` (0-1) do lado do icone."""
    target = int(size * coverage)
    ratio = min(target / logo.width, target / logo.height)
    width = max(1, round(logo.width * ratio))
    height = max(1, round(logo.height * ratio))
    resized = logo.resize((width, height), Image.LANCZOS)

    canvas = Image.new('RGBA', (size, size), BACKGROUND + (255,))
    canvas.paste(resized, ((size - width) // 2, (size - height) // 2), resized)
    # Icones do iOS nao podem ter canal alpha.
    return canvas.convert('RGB') if opaque else canvas


# (destino, tamanho, ocupacao da logo, sem canal alpha)
TARGETS = [
    (PUBLIC / 'icon-192.png', 192, 0.82, False),
    (PUBLIC / 'icon-512.png', 512, 0.82, False),
    # Maskable: o launcher do Android recorta as bordas, entao a logo fica na zona segura.
    (PUBLIC / 'icon-512-maskable.png', 512, 0.60, False),
    (PUBLIC / 'apple-touch-icon.png', 180, 0.82, True),
    (IOS_APPICON, 1024, 0.74, True),
]


def main() -> None:
    logo = load_trimmed_logo()
    for destination, size, coverage, opaque in TARGETS:
        icon = render_icon(logo, size, coverage, opaque)
        icon.save(destination, format='PNG')
        print(f'gerado {destination.relative_to(ROOT)} ({size}x{size})')


if __name__ == '__main__':
    main()
