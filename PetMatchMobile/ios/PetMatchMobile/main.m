#import <UIKit/UIKit.h>

#import "AppDelegate.h"

#import <FirebaseCore/FirebaseCore.h>


int main(int argc, char * argv[]) {
  @autoreleasepool {
    if ([FIRApp defaultApp] == nil) {
          [FIRApp configure];
      }
    return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
  }
}
