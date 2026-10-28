require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "abrova-push-react-native"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/Abrova-co/abrova_push_react_native_sdk.git", :tag => "#{s.version}" }

  # Only include the React Native bridge files - native SDK comes from dependency
  s.source_files = "ios/AbrovaPushReactNative.{m,swift}"

  s.dependency "React-Core"

  # Use the native iOS SDK as a dependency (like Android uses AAR from Maven)
  # During development, you can use a local path:
  #   pod 'AbrovaPush', :path => '../../../../ios/AbrovaPush'
  # For production, use the published version from a spec repo or direct URL
  s.dependency "AbrovaPushSDK", "~> 0.1.18"

  s.swift_version = "5.0"
end
