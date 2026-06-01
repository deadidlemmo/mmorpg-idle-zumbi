from pathlib import Path
from shutil import copy2

from PIL import Image
from rembg import new_session, remove

PROJECT_ROOT = Path(r"C:\Users\Neto\Desktop\Projetos\Em uso\mmorpg-idle-zumbi")

SOURCE_FOLDERS = {
    "full-body": PROJECT_ROOT / r"frontend\src\assets\images\mobs\full-body",
    "portraits": PROJECT_ROOT / r"frontend\src\assets\images\mobs\portraits",
}

BACKUP_ROOT = PROJECT_ROOT / "_backup_remove_bg"
ORIGINALS_ROOT = BACKUP_ROOT / "originals"
OUTPUT_ROOT = BACKUP_ROOT / "output"

MODEL_NAME = "isnet-anime"

VALID_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def ensure_dirs():
    ORIGINALS_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    for folder_name in SOURCE_FOLDERS.keys():
        (ORIGINALS_ROOT / folder_name).mkdir(parents=True, exist_ok=True)
        (OUTPUT_ROOT / folder_name).mkdir(parents=True, exist_ok=True)


def backup_original_file(src_file: Path, folder_name: str):
    backup_file = ORIGINALS_ROOT / folder_name / src_file.name

    if not backup_file.exists():
        copy2(src_file, backup_file)

    return backup_file


def remove_bg_and_save(src_file: Path, folder_name: str, session):
    output_file = OUTPUT_ROOT / folder_name / f"{src_file.stem}.png"

    with Image.open(src_file) as img:
        original_size = img.size

        img = img.convert("RGBA")

        result = remove(
            img,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )

        result = result.convert("RGBA")

        if result.size != original_size:
            raise RuntimeError(
                f"Resolução alterada em {src_file.name}: "
                f"{original_size} -> {result.size}"
            )

        result.save(
            output_file,
            format="PNG",
            optimize=False,
            compress_level=6,
        )

    return output_file, original_size


def main():
    ensure_dirs()

    print("=" * 70)
    print("Remoção de fundo dos mobs")
    print(f"Modelo usado: {MODEL_NAME}")
    print(f"Backup dos originais: {ORIGINALS_ROOT}")
    print(f"Saída sem fundo:      {OUTPUT_ROOT}")
    print("=" * 70)

    session = new_session(MODEL_NAME)

    total_processed = 0
    total_failed = 0

    for folder_name, source_folder in SOURCE_FOLDERS.items():
        print(f"\nProcessando: {source_folder}")

        if not source_folder.exists():
            print(f"[ERRO] Pasta não encontrada: {source_folder}")
            continue

        files = sorted(
            file
            for file in source_folder.iterdir()
            if file.is_file() and file.suffix.lower() in VALID_EXTENSIONS
        )

        if not files:
            print("[AVISO] Nenhuma imagem encontrada nessa pasta.")
            continue

        for src_file in files:
            try:
                backup_original_file(src_file, folder_name)
                output_file, size = remove_bg_and_save(src_file, folder_name, session)

                print(
                    f"[OK] {src_file.name} -> {output_file.name} "
                    f"| resolução {size[0]}x{size[1]}"
                )

                total_processed += 1

            except Exception as error:
                print(f"[ERRO] {src_file.name} -> {error}")
                total_failed += 1

    print("\n" + "=" * 70)
    print("Finalizado")
    print(f"Imagens processadas com sucesso: {total_processed}")
    print(f"Imagens com erro: {total_failed}")
    print(f"Backup dos originais em: {ORIGINALS_ROOT}")
    print(f"Imagens sem fundo em:     {OUTPUT_ROOT}")
    print("=" * 70)


if __name__ == "__main__":
    main()
