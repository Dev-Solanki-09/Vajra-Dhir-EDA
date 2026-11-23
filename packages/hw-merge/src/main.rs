use std::env;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::process::exit;
use vd_ir::model::HardwareEntity;
use vd_merge::{HwMergeDriver, MergeResult};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 4 {
        eprintln!("Usage: hw-merge <base> <ours> <theirs> [-o <output>]");
        eprintln!("  Standard Git merge driver for *.vd-ir.jsonl");
        exit(2);
    }

    let base_path = &args[1];
    let ours_path = &args[2];
    let theirs_path = &args[3];

    let output_path = if args.len() >= 6 && args[4] == "-o" {
        &args[5]
    } else {
        ours_path // Git convention: overwrite OURS (%A)
    };

    let base_entities = match read_jsonl(base_path) {
        Ok(e) => e,
        Err(err) => {
            eprintln!("Error reading base file {}: {}", base_path, err);
            exit(2);
        }
    };

    let ours_entities = match read_jsonl(ours_path) {
        Ok(e) => e,
        Err(err) => {
            eprintln!("Error reading ours file {}: {}", ours_path, err);
            exit(2);
        }
    };

    let theirs_entities = match read_jsonl(theirs_path) {
        Ok(e) => e,
        Err(err) => {
            eprintln!("Error reading theirs file {}: {}", theirs_path, err);
            exit(2);
        }
    };

    match HwMergeDriver::merge_3way(&base_entities, &ours_entities, &theirs_entities) {
        Ok(MergeResult {
            merged_entities,
            conflicts,
        }) => {
            if conflicts.is_empty() {
                if let Err(e) = write_jsonl(output_path, &merged_entities) {
                    eprintln!("Error writing merged output to {}: {}", output_path, e);
                    exit(2);
                }
                println!("hw-merge: Clean 3-way merge completed. {} entities written.", merged_entities.len());
                exit(0);
            } else {
                eprintln!("hw-merge: CONFLICTS DETECTED ({} conflicts):", conflicts.len());
                for (idx, c) in conflicts.iter().enumerate() {
                    eprintln!("  [{}] {:?} on entity {}: {}", idx + 1, c.kind, c.entity_id, c.description);
                }

                // Write conflict marked file to output
                let _ = write_conflict_file(output_path, &merged_entities, &conflicts);
                exit(1);
            }
        }
        Err(e) => {
            eprintln!("hw-merge internal error: {}", e);
            exit(2);
        }
    }
}

fn read_jsonl(path: &str) -> Result<Vec<HardwareEntity>, Box<dyn std::error::Error>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut entities = Vec::new();

    for line_res in reader.lines() {
        let line = line_res?;
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let entity: HardwareEntity = serde_json::from_str(trimmed)?;
        entities.push(entity);
    }

    Ok(entities)
}

fn write_jsonl(path: &str, entities: &[HardwareEntity]) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    for ent in entities {
        let s = serde_json::to_string(ent).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        writeln!(file, "{}", s)?;
    }
    Ok(())
}

fn write_conflict_file(
    path: &str,
    clean_entities: &[HardwareEntity],
    conflicts: &[vd_merge::MergeConflict],
) -> std::io::Result<()> {
    let mut file = OpenOptions::new().write(true).truncate(true).create(true).open(path)?;

    writeln!(file, "# Vajra-Dhīr EDA 3-Way Merge Conflict File")?;
    for c in conflicts {
        writeln!(file, "<<<<<<< OURS (Conflict: {:?} on {})", c.kind, c.entity_id)?;
        if let Some(ref o) = c.ours_snippet {
            writeln!(file, "{}", o)?;
        }
        writeln!(file, "=======")?;
        if let Some(ref t) = c.theirs_snippet {
            writeln!(file, "{}", t)?;
        }
        writeln!(file, ">>>>>>> THEIRS")?;
    }

    for ent in clean_entities {
        let s = serde_json::to_string(ent).unwrap_or_default();
        writeln!(file, "{}", s)?;
    }
    Ok(())
}
