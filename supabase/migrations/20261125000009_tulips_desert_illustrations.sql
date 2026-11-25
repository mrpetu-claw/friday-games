-- Painted illustrations for MS-005 and MS-006 (only replaces the original drawings).
update public.mysteries set image_path = replace(image_path, '.svg', '.webp')
 where id in ('MS-005', 'MS-006') and image_path like 'mysteries/%.svg';
