#!/usr/bin/env ruby
# scripts/add-glowup-to-xcode.rb
#
# Adds the Features/Glowup/ + Features/FakeLimited/ folders (and their
# .swift files) into the Xcode project (apps/ios/AIGoldRoblox.xcodeproj),
# attaching them to the AIGoldRoblox target's source-build phase.
#
# Idempotent: skips files/groups that already exist by path.
# Backs up project.pbxproj before mutation.
#
# Requires: gem install xcodeproj
# Run with Xcode CLOSED (Xcode caches the in-memory project and will
# overwrite our changes on next save if it's open during the run).

require 'xcodeproj'
require 'fileutils'

PROJECT_PATH = File.expand_path('../apps/ios/AIGoldRoblox.xcodeproj', __dir__)
PBXPROJ = File.join(PROJECT_PATH, 'project.pbxproj')
TARGET_NAME = 'AIGoldRoblox'

# Folders + files to add, keyed by group name under "Features".
FOLDERS_TO_ADD = {
  'Glowup' => [
    'GlowupAPIClient.swift',
    'GlowupStudio.swift',
    'GlowupStudioView.swift',
    'GlowupResultView.swift',
  ],
  'FakeLimited' => [
    'FakeLimitedRecipeCard.swift',
  ],
  'Outfit' => [
    'OutfitAPIClient.swift',
    'OutfitStudio.swift',
    'OutfitStudioView.swift',
    'OutfitResultView.swift',
  ],
}

abort("Project not found at #{PROJECT_PATH}") unless File.directory?(PROJECT_PATH)

# Backup
backup_path = "#{PBXPROJ}.backup-#{Time.now.to_i}"
FileUtils.cp(PBXPROJ, backup_path)
puts "Backed up to #{backup_path}"

project = Xcodeproj::Project.open(PROJECT_PATH)
target = project.targets.find { |t| t.name == TARGET_NAME }
abort("Target #{TARGET_NAME} not found") unless target

# Find the "Features" group (Project Navigator group under main app group).
def find_group_recursive(group, name)
  return group if group.name == name || group.display_name == name
  group.groups.each do |child|
    found = find_group_recursive(child, name)
    return found if found
  end
  nil
end

main_group = project.main_group
features_group = find_group_recursive(main_group, 'Features')
abort("Could not locate Features group in Xcode project") unless features_group
puts "Found Features group: #{features_group.hierarchy_path}"

changed_files = 0
FOLDERS_TO_ADD.each do |folder_name, files|
  # Find existing subgroup under Features (by name) or create one.
  subgroup = features_group.groups.find { |g| g.display_name == folder_name }
  if subgroup.nil?
    subgroup = features_group.new_group(folder_name, folder_name)
    puts "  + Created group: Features/#{folder_name}"
  else
    puts "  · Reusing existing group: Features/#{folder_name}"
  end

  files.each do |filename|
    # Already in project? skip.
    existing = subgroup.files.find { |f| f.display_name == filename }
    if existing
      puts "    · #{filename} already in project, skipping"
      next
    end
    file_ref = subgroup.new_reference(filename)
    target.add_file_references([file_ref])
    puts "    + Added #{filename} to target #{TARGET_NAME}"
    changed_files += 1
  end
end

if changed_files == 0
  puts "\nNothing to change — all files were already in the project."
  exit 0
end

project.save
puts "\n✓ Saved project. Added #{changed_files} file(s)."
puts "  → Open Xcode and Build (⌘B)."
