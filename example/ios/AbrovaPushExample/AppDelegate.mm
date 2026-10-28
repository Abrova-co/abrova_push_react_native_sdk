#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

// Forward declaration — AbrovaPushReactNative is defined in the RN bridge Swift file
@interface AbrovaPushReactNative : NSObject
+ (void)didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken;
+ (void)didFailToRegisterForRemoteNotificationsWithError:(NSError *)error;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"AbrovaPushExample";
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Disable bridgeless mode so bridge-based native modules (abrova-push) work
- (BOOL)bridgelessEnabled
{
  return NO;
}

// Forward APNs token to AbrovaPush SDK via the React Native bridge
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  [AbrovaPushReactNative didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  [AbrovaPushReactNative didFailToRegisterForRemoteNotificationsWithError:error];
}

@end
