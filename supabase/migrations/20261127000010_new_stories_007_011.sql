-- Five new cases (MS-007 … MS-011), written with the external story prompt.
-- Small edits for fairness: MS-008 says "guest lift" (the solution uses a separate
-- service lift); MS-010 drops the roof-vent detail and the "completely full" bucket,
-- which condensation alone could not explain.
-- Pictures start as drawn placeholders (.svg); swap for painted .webp later.

insert into public.mysteries (id, title, category, difficulty, public_prompt, image_path, private_solution) values
('MS-007', 'The Vanishing Portrait', 'Office', 'Easy',
 'Every morning, a large portrait hangs on the wall of a meeting room. One Monday, the portrait had completely disappeared, although nobody had entered the room over the weekend. By lunchtime, it had returned to exactly the same position. Security footage confirmed that nobody had touched it.',
 'mysteries/ms-007.svg',
 'The portrait was shown on a digital screen disguised as a traditional picture frame. An automatic overnight software update left the screen showing a black background instead of the portrait. At lunchtime the screen restarted and automatically restored the image. Nobody needed to enter the room or touch the frame.'),

('MS-008', 'The Impossible Delivery', 'Travel', 'Easy',
 'A courier arrived at a hotel carrying a large, sealed package for a guest on the fifth floor. The guest lift was working, but the courier never used it or climbed the stairs. Ten minutes later, the package was waiting outside the guest''s room. Nobody else had carried it upstairs.',
 'mysteries/ms-008.svg',
 'The hotel had a separate service lift built to move luggage and parcels between floors. The courier put the package in the service lift on the ground floor and sent it straight to the fifth floor. The guest had arranged beforehand for it to be delivered to a secure collection compartment beside their room, so the courier never had to go upstairs.'),

('MS-009', 'The Frozen Conference', 'Business', 'Medium',
 'During an important international conference, every participant suddenly appeared to stop moving. For almost two minutes, nobody raised a hand, changed position or spoke. The organiser could still hear people talking and knew the conference had not been interrupted. Then everyone started moving again at exactly the same moment.',
 'mysteries/ms-009.svg',
 'The conference was held over a video call. A technical fault froze the incoming video feed while the audio carried on normally. The organiser could hear participants speaking but saw only their frozen images. When the video connection recovered, everyone appeared to start moving again at the same moment.'),

('MS-010', 'The Rainy Greenhouse', 'Home & Garden', 'Medium',
 'A gardener locked a greenhouse on Friday evening before leaving for the weekend. When she returned on Monday, the floor was wet, every plant had been watered and a bucket near the entrance had water in it. There had been no rain, the greenhouse roof was intact and the water supply had been switched off.',
 'mysteries/ms-010.svg',
 'No new water came in: the greenhouse watered itself with its own water. On the sunny weekend days the sealed greenhouse grew very hot, and moisture evaporated from the damp soil and the plants. At night the glass roof cooled, the vapour condensed on it, and the drops ran down the sloping glass and fell onto the plants, the floor and into the bucket standing under the lowest edge of the roof. The cycle repeated all weekend.'),

('MS-011', 'The Perfectly Wrong Photograph', 'Science', 'Hard',
 'A photographer took a picture of six identical clocks arranged in a straight line. All six clocks were working correctly and showed exactly the same time. However, in the photograph, each clock appeared to show a different time. The photographer had not edited the image, and none of the clocks had been moved or adjusted.',
 'mysteries/ms-011.svg',
 'The clocks had digital displays that flicker their segments on and off far too fast for the eye to notice. The camera had a rolling shutter, which records the picture line by line, so each clock was captured at a slightly different moment of its flicker cycle. Each clock therefore appeared in the photo with different segments lit, showing what looked like different times, even though to anyone in the room all six showed the same correct time.');

insert into public.clues (mystery_id, sort_order, points, text) values
('MS-007', 1, 3, 'The portrait was not painted on canvas.'),
('MS-007', 2, 2, 'The frame stayed on the wall throughout the weekend.'),
('MS-007', 3, 3, 'Electricity was needed for the portrait to be visible.'),
('MS-007', 4, 2, 'The disappearance happened after an automatic overnight process.'),
('MS-007', 5, 3, 'The portrait came back when an electronic device restarted.'),

('MS-008', 1, 3, 'The package travelled upstairs without a person going with it.'),
('MS-008', 2, 2, 'The hotel had equipment designed specifically to move objects.'),
('MS-008', 3, 3, 'There was more than one lift in the building.'),
('MS-008', 4, 2, 'The guest had arranged a special delivery method beforehand.'),
('MS-008', 5, 3, 'The package arrived through a compartment connected to the other lift.'),

('MS-009', 1, 3, 'The participants were not physically together.'),
('MS-009', 2, 2, 'The organiser could hear people throughout the incident.'),
('MS-009', 3, 3, 'The problem affected what the organiser could see, not what participants were doing.'),
('MS-009', 4, 2, 'The participants did not notice anything unusual.'),
('MS-009', 5, 3, 'The sound and the picture travelled over separate connections.'),

('MS-010', 1, 3, 'No new water entered the greenhouse.'),
('MS-010', 2, 2, 'The greenhouse got very hot by day and cold by night.'),
('MS-010', 3, 3, 'Water inside the greenhouse turned into vapour and back into liquid.'),
('MS-010', 4, 2, 'The glass roof became much cooler overnight.'),
('MS-010', 5, 3, 'Moisture collected on the roof before dripping onto the plants and floor.'),

('MS-011', 1, 3, 'The clocks did not have hands.'),
('MS-011', 2, 2, 'To anyone looking at them, the clocks looked identical.'),
('MS-011', 3, 3, 'The displays switched their lit segments on and off extremely fast.'),
('MS-011', 4, 2, 'The camera did not record the whole picture at exactly the same instant.'),
('MS-011', 5, 3, 'Different parts of the picture caught the displays at different moments.'),
('MS-011', 6, 3, 'The odd times came from the camera and the displays working against each other.');
