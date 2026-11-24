-- Story review (24 Nov 2026): tighten logic, order clues from broad to
-- specific, switch illustrations to the new image files.

-- MS-001 — clue order: broad (who) → mechanism (how)
update public.mysteries set image_path = 'mysteries/ms-001.webp' where id = 'MS-001';
delete from public.clues where mystery_id = 'MS-001'
  and not exists (select 1 from public.clue_awards a where a.clue_id = clues.id);
insert into public.clues (mystery_id, sort_order, points, text)
select * from (values
  ('MS-001', 1, 3, 'The culprit was not a person.'),
  ('MS-001', 2, 3, 'The alarm was triggered by a motion sensor, not by a door or window.'),
  ('MS-001', 3, 2, 'The bites were very small.'),
  ('MS-001', 4, 2, 'Tiny paw prints were found in the flour on the counter.'),
  ('MS-001', 5, 3, 'The roof extractor duct had been left open to cool the ovens.')
) v(mystery_id, sort_order, points, text)
where not exists (select 1 from public.clues c where c.mystery_id = 'MS-001');

-- MS-002 — the teacher's promise is now part of the hidden story, so the
-- "full marks" is fully explained.
update public.mysteries set
  public_prompt = 'A student answered all 50 questions on her exam incorrectly. Her teacher gave her full marks and a prize in front of the whole class.',
  private_solution = 'It was a true-or-false exam. The week before, the teacher had joked that getting every answer wrong is harder than getting them all right, and promised full marks to anyone who managed it. Guessing your way to 50 wrong answers is practically impossible (about one chance in a thousand trillion), so she had to know every correct answer and deliberately pick the opposite. The teacher kept the promise.'
where id = 'MS-002';
delete from public.clues where mystery_id = 'MS-002'
  and not exists (select 1 from public.clue_awards a where a.clue_id = clues.id);
insert into public.clues (mystery_id, sort_order, points, text)
select * from (values
  ('MS-002', 1, 3, 'It was a true-or-false exam.'),
  ('MS-002', 2, 3, 'She got the answers wrong on purpose.'),
  ('MS-002', 3, 3, 'To get every answer wrong, she had to know every right answer.'),
  ('MS-002', 4, 2, 'Getting all 50 wrong just by guessing is almost impossible.'),
  ('MS-002', 5, 3, 'The teacher had promised full marks to anyone who got every answer wrong.')
) v(mystery_id, sort_order, points, text)
where not exists (select 1 from public.clues c where c.mystery_id = 'MS-002');

-- MS-005 — the culprit was by the front door all along (its charging dock),
-- not "in the garage": prompt and solution now agree.
update public.mysteries set
  public_prompt = 'Every night for a week, the tulips in Mr Halloran''s front garden were cut cleanly at the stem and left in a neat little pile by his front door. When he finally caught the culprit, it turned out to have been sitting right by that door all along.',
  private_solution = 'The culprit was his brand-new robot lawnmower. It was set to mow at midnight, and the boundary wire had been laid through the middle of the tulip bed, so its blades cut the stems. The flowers got caught on its body and dropped off every time it parked back on its charging dock, right next to the front door.'
where id = 'MS-005';
update public.clues set text = 'The mower''s charging dock is right next to the front door.'
 where mystery_id = 'MS-005' and sort_order = 5;

-- MS-004 — small wording fix in the solution
update public.mysteries set
  private_solution = 'The jeweller had sent the box to himself as a trap. Two of his earlier shipments had vanished in transit, so he sent an empty box labelled as £50,000 of diamonds, with a hidden tracker inside and a numbered tamper seal. It arrived with a different seal, and the tracker showed it had been opened at a depot at 2 a.m. That identified the dishonest employee, and the police recovered his missing jewellery.'
where id = 'MS-004';
