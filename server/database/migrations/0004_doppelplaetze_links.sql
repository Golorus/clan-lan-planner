-- Die Plätze laufen jetzt von links nach rechts aufsteigend: links am Tisch sitzt die niedrigere Nummer.
-- Doppelt breite Plätze liegen deshalb auf der ersten Nummer des Tisches (A-81 für den Tisch A-81/A-82),
-- bisher lagen sie auf der zweiten (A-82). Den Tisch belegen sie weiterhin ganz, der Platz daneben ist also frei.
UPDATE `registrations`
SET `seat` = substr(`seat`, 1, instr(`seat`, '-')) || (CAST(substr(`seat`, instr(`seat`, '-') + 1) AS INTEGER) - 1)
WHERE `double` = 1 AND `seat` IS NOT NULL AND EXISTS (
	SELECT 1 FROM `seat_rows` r
	WHERE r.`event_id` = `registrations`.`event_id`
		AND r.`letter` = substr(`registrations`.`seat`, 1, instr(`registrations`.`seat`, '-') - 1)
		AND (CAST(substr(`registrations`.`seat`, instr(`registrations`.`seat`, '-') + 1) AS INTEGER) - r.`start`) % 2 = 1
);
