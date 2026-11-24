-- Friday Games — original Mystery Stories catalogue (English content)
-- Clue points: +3 for important clues, +2 for supporting ones.
-- Bonuses (partial deduction +5, full solve +15, wrong guess −2) live in session settings.

insert into public.mysteries (id, title, category, difficulty, public_prompt, image_path, private_solution) values
('MS-001', 'The Bakery Alarm', 'Everyday', 'Easy',
 'At 4 a.m. the burglar alarm at a small bakery went off. When the police arrived, every door and window was still locked, nothing was missing and nobody was inside. But every single loaf on the cooling racks had one small bite taken out of it.',
 'mysteries/ms-001.svg',
 'A squirrel did it. The baker had left the roof extractor duct open overnight to let the ovens cool. A squirrel climbed in through the duct, hopped along the cooling racks taking a nibble from each loaf, set off the motion sensor, and escaped the same way it came in.'),

('MS-002', 'The All-Wrong Exam', 'School', 'Medium',
 'A student answered every one of the 50 questions on her exam incorrectly. Her teacher gave her full marks and a prize in front of the whole class.',
 'mysteries/ms-002.svg',
 'It was a true-or-false exam. Getting all 50 answers wrong by guessing is practically impossible (about one chance in a thousand trillion), so she must have known every correct answer and deliberately flipped each one. The teacher had joked that "nobody could score zero even if they tried", and she took up the challenge.'),

('MS-003', 'The Dark Lighthouse', 'Maritime', 'Hard',
 'On the stormiest night of the year, a lighthouse keeper deliberately switched off his lamp. By morning he was being called a hero for saving a ship and its crew.',
 'mysteries/ms-003.svg',
 'A power cut had knocked out the harbour lights in the nearby town. A cargo ship with a broken radio mistook the lighthouse for the harbour entrance and was steering straight at it, towards the rocks beneath. The keeper could not radio the ship, so he switched the light off. The captain, suddenly losing his "harbour light", realised something was wrong, stopped engines and waited for daylight.'),

('MS-004', 'The Empty Box', 'Business', 'Medium',
 'A courier delivered a perfectly empty box to a jeweller. The jeweller paid £500 for the delivery and said it was the best money he had ever spent.',
 'mysteries/ms-004.svg',
 'The jeweller had sent the box to himself as a trap. Two of his earlier shipments had vanished in transit, so he sent an empty box labelled as £50,000 of diamonds, with a hidden tracker inside and a numbered tamper seal. It arrived with a different seal and the tracker showed it had been opened at a depot at 2 a.m., which identified the dishonest employee.'),

('MS-005', 'The Midnight Tulips', 'Home & Garden', 'Medium',
 'Every night for a week, the tulips in Mr Halloran''s front garden were cut cleanly at the stem and left in a neat little pile by his front door. He finally found the culprit — it had been living in his garage the whole time.',
 'mysteries/ms-005.svg',
 'The culprit was his brand-new robot lawnmower. It was set to mow at midnight, and the boundary wire had been laid through the middle of the tulip bed, so its blades cut the stems. The flowers got caught on its body and dropped off when it returned to its charging dock, which was next to the front door. It was stored in the garage during the day.'),

('MS-006', 'The Desert Ship', 'Travel', 'Hard',
 'A full-sized wooden sailing ship stands in the main square of a desert town, hundreds of kilometres from the sea. Nobody carried it there, and it has never been taken apart.',
 'mysteries/ms-006.svg',
 'The ship was built right there in the square and has never touched water. The town''s founders arrived by sea from far away generations ago, and their descendants had local carpenters build a full-sized copy of that ship, from the original plans, as a monument to their journey.');

insert into public.clues (mystery_id, sort_order, points, text) values
('MS-001', 1, 3, 'The alarm was triggered by a motion sensor, not by a door or window.'),
('MS-001', 2, 2, 'The bites were very small.'),
('MS-001', 3, 3, 'The culprit was not a person.'),
('MS-001', 4, 3, 'The roof extractor duct had been left open to cool the ovens.'),
('MS-001', 5, 2, 'Tiny paw prints were found in the flour on the counter.'),

('MS-002', 1, 3, 'It was a true-or-false exam.'),
('MS-002', 2, 3, 'Getting every answer wrong by chance is almost impossible.'),
('MS-002', 3, 3, 'She got them wrong on purpose.'),
('MS-002', 4, 2, 'The teacher had said nobody could score zero even if they tried.'),
('MS-002', 5, 3, 'Flipping every answer gives a perfect score.'),

('MS-003', 1, 3, 'A ship was heading straight towards the lighthouse.'),
('MS-003', 2, 3, 'The town''s harbour lights were out because of a power cut.'),
('MS-003', 3, 3, 'The captain mistook the lighthouse for the harbour entrance.'),
('MS-003', 4, 2, 'The ship''s radio was not working.'),
('MS-003', 5, 3, 'When the light disappeared, the captain stopped the engines.'),

('MS-004', 1, 3, 'The jeweller sent the box himself.'),
('MS-004', 2, 2, 'Some of his earlier shipments had gone missing.'),
('MS-004', 3, 3, 'The box was labelled as containing valuable diamonds.'),
('MS-004', 4, 3, 'There was a hidden tracker inside the box.'),
('MS-004', 5, 3, 'The tamper seal had been replaced on the way.'),

('MS-005', 1, 3, 'The culprit was neither a person nor an animal.'),
('MS-005', 2, 2, 'It only ever happened around midnight.'),
('MS-005', 3, 3, 'He had recently bought a robot lawnmower.'),
('MS-005', 4, 3, 'The mower''s boundary wire ran through the tulip bed.'),
('MS-005', 5, 3, 'The mower''s charging dock was next to the front door.'),

('MS-006', 1, 3, 'The ship has never been in water.'),
('MS-006', 2, 3, 'It was built where it stands.'),
('MS-006', 3, 3, 'It is a monument.'),
('MS-006', 4, 3, 'The town''s founders originally arrived by sea.'),
('MS-006', 5, 2, 'It was built from a real ship''s original plans.');
