# Mob Image Pack - MMORPG Idle Zumbi

This package prepares image generation for the 120 game mobs using the correct asset order and filenames.

## Files

- `mob-image-manifest.csv`: canonical mob list with tier, map, submap, order, and expected file names.
- `mob-image-prompts.json`: full-body and portrait prompts for every mob.
- `README-geracao-imagens.md`: this guide.

## Naming convention

The naming is global inside each tier:

- Full body: `frontend/src/assets/images/mobs/full-body/mobN-tT.png`
- Portrait: `frontend/src/assets/images/mobs/portraits/mobN-tT.png`

Examples:

- `mob1-t1.png` = first global Tier 1 mob, Errante do Suburbio.
- `mob9-t1.png` = Porteiro Infectado.
- `mob12-t1.png` = Sindico Devorado.

Do not use `mob1-t1` for the first mob of the third Tier 1 submap. The numbering does not restart by submap.

## Mandatory visual rule

The monsters must not look like clones of each other.

Every prompt includes this rule:

> The monster must not share the same silhouette, pose, body proportions, head shape, limb arrangement, clothing outline, mutation pattern, or primary visual hook with any other mob in the complete 120-monster set.

In practice, always vary:

- height and body mass;
- posture;
- number and position of arms, legs, wings, tail, or appendages;
- head shape;
- clothing and equipment outline;
- main mutation;
- key prop or silhouette hook;
- tier color accents;
- expression and pose.

## Recommended workflow

1. Generate full-body assets first using `fullBodyPrompt`.
2. Generate portraits after that using `portraitPrompt`, preserving the same identity as the full-body version.
3. Save each file exactly at the path shown in `fullBodyFile` and `portraitFile`.
4. When all images are ready, zip the `full-body` and `portraits` folders.

## Note

This package does not include final generated images. It includes canonical ordering and generation prompts to prevent wrong filenames, wrong tier assignment, and repeated monster silhouettes.
