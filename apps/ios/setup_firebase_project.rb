require "xcodeproj"

project_path = File.expand_path("AIGoldRoblox.xcodeproj", __dir__)
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |item| item.name == "AIGoldRoblox" }
raise "Target AIGoldRoblox not found" unless target

resources_group = project.main_group.find_subpath("AIGoldRoblox/Resources", true)
plist_relative_path = "GoogleService-Info.plist"
plist_full_path = File.expand_path("AIGoldRoblox/Resources/#{plist_relative_path}", __dir__)
raise "Missing #{plist_full_path}" unless File.exist?(plist_full_path)

plist_ref = resources_group.files.find { |file| file.path == plist_relative_path } || resources_group.new_file(plist_relative_path)
unless target.resources_build_phase.files_references.include?(plist_ref)
  target.resources_build_phase.add_file_reference(plist_ref, true)
end

firebase_url = "https://github.com/firebase/firebase-ios-sdk.git"
firebase_package = project.root_object.package_references.find { |ref| ref.repositoryURL == firebase_url }
unless firebase_package
  firebase_package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  firebase_package.repositoryURL = firebase_url
  firebase_package.requirement = {
    "kind" => "upToNextMajorVersion",
    "minimumVersion" => "12.11.0",
  }
  project.root_object.package_references << firebase_package
end

["FirebaseCore", "FirebaseAuth"].each do |product_name|
  dependency = target.package_product_dependencies.find { |dep| dep.product_name == product_name }
  unless dependency
    dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
    dependency.package = firebase_package
    dependency.product_name = product_name
    target.package_product_dependencies << dependency
  end

  build_file = target.frameworks_build_phase.files.find { |file| file.product_ref == dependency }
  unless build_file
    build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
    build_file.product_ref = dependency
    target.frameworks_build_phase.files << build_file
  end
end

google_sign_in_url = "https://github.com/google/GoogleSignIn-iOS"
google_sign_in_package = project.root_object.package_references.find { |ref| ref.repositoryURL == google_sign_in_url }
unless google_sign_in_package
  google_sign_in_package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  google_sign_in_package.repositoryURL = google_sign_in_url
  google_sign_in_package.requirement = {
    "kind" => "upToNextMajorVersion",
    "minimumVersion" => "9.1.0",
  }
  project.root_object.package_references << google_sign_in_package
end

google_dependency = target.package_product_dependencies.find { |dep| dep.product_name == "GoogleSignIn" }
unless google_dependency
  google_dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  google_dependency.package = google_sign_in_package
  google_dependency.product_name = "GoogleSignIn"
  target.package_product_dependencies << google_dependency
end

google_build_file = target.frameworks_build_phase.files.find { |file| file.product_ref == google_dependency }
unless google_build_file
  google_build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  google_build_file.product_ref = google_dependency
  target.frameworks_build_phase.files << google_build_file
end

target.build_configurations.each do |config|
  flags = Array(config.build_settings["OTHER_LDFLAGS"])
  inherited_missing = !flags.include?("$(inherited)")
  objc_missing = !flags.include?("-ObjC")
  next unless inherited_missing || objc_missing

  flags << "$(inherited)" if inherited_missing
  flags << "-ObjC" if objc_missing
  config.build_settings["OTHER_LDFLAGS"] = flags
  config.build_settings["GENERATE_INFOPLIST_FILE"] = "NO"
  config.build_settings["INFOPLIST_FILE"] = "AIGoldRoblox/App/Info.plist"
end

project.save
puts "Firebase project setup complete."
